'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateProfile } from '@/lib/profile';
import { claimAnonymousReports } from '@/lib/claim-reports';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site-url';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailLocale } from '@/lib/email/types';
import { localeUrl } from '@/lib/email/url';
import { captureServerException, flushPostHog } from '@/lib/posthog-server';
import { safeNextPath } from '@/lib/safe-next-path';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { AuthError } from '@supabase/supabase-js';

const RESET_EXPIRES_IN_HOURS = 1;
// Supabase magic links / email OTPs expire after 1 hour by default.
const MAGIC_LINK_EXPIRES_IN_HOURS = 1;

const AUTH_EMAIL_WINDOW_MS = 60 * 60 * 1000;
// Per address, per flow: room for the honest "it never arrived, send it again"
// without handing anyone a mailbox flooder.
const AUTH_EMAILS_PER_ADDRESS = 5;
// Per IP, shared by all three flows: what burns the Resend quota and gets the
// sending domain flagged is total outbound volume, not any single entry point.
const AUTH_EMAILS_PER_IP = 20;

const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';
const RATE_LIMITED_ERROR = 'Too many requests. Please try again later.';

/**
 * These flows mail through admin.generateLink + Resend, which sidesteps
 * Supabase's own email throttling, so the limit has to live here. Says nothing
 * about whether the address exists — callers must keep it that way.
 */
async function isAuthEmailRateLimited(flow: string, email: string): Promise<boolean> {
  const ip = getClientIp(await headers());
  const perAddress = checkRateLimit({
    key: `auth:${flow}:email:${email.trim().toLowerCase()}`,
    limit: AUTH_EMAILS_PER_ADDRESS,
    windowMs: AUTH_EMAIL_WINDOW_MS,
  });
  const perIp = checkRateLimit({
    key: `auth:email:ip:${ip}`,
    limit: AUTH_EMAILS_PER_IP,
    windowMs: AUTH_EMAIL_WINDOW_MS,
  });
  return !perAddress.allowed || !perIp.allowed;
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const next = safeNextPath(formData.get('next'));
  const locale = (formData.get('locale') as string) || 'pl';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Existing accounts can be authenticated without ever having a profile row
  // (e.g. email confirmed in another browser, then password login). Ensure it
  // exists here so subsequent writes don't hit the author_id FK.
  if (data.user) {
    await getOrCreateProfile(data.user, locale);
    // Password login doesn't pass through /auth/callback, so claim anonymous
    // reports here too — a returning user who just submitted logged-out still
    // gets their report + the contributor unlock.
    await claimAnonymousReports(data.user.id);
  }

  redirect(next || `/${locale}/dashboard`);
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const locale = (formData.get('locale') as string) || 'pl';
  const next = safeNextPath(formData.get('next'));
  const emailLocale = resolveEmailLocale(locale);

  if (!email?.trim()) {
    return { error: 'Email is required' };
  }

  if (await isAuthEmailRateLimited('signup', email)) {
    return { error: RATE_LIMITED_ERROR };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        redirectTo: `${SITE_URL}/${locale}/auth/callback`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    const hashedToken = data?.properties?.hashed_token;

    if (hashedToken) {
      // Carry `next` through the email-confirmation link so a user who started
      // from "submit costs" lands on the submit page after confirming (the
      // callback route honours `next`), instead of always on /dashboard.
      const confirmUrl = localeUrl(
        emailLocale,
        `/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=signup${
          next ? `&next=${encodeURIComponent(next)}` : ''
        }`,
      );

      await sendEmail({
        to: email,
        locale: emailLocale,
        template: 'signupConfirmation',
        data: { confirmUrl },
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[auth] Signup failed:', err);
    captureServerException(err, {
      distinctId: email,
      properties: { source: 'auth', action: 'signup' },
    });
    await flushPostHog();
    return { error: GENERIC_AUTH_ERROR };
  }
}

export async function signInWithGoogle(locale: string, next?: string) {
  const supabase = await createClient();
  const safeNext = safeNextPath(next);

  const callbackUrl = new URL(`/${locale}/auth/callback`, SITE_URL);
  if (safeNext) callbackUrl.searchParams.set('next', safeNext);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    return { error: error?.message || 'Failed to initiate Google sign-in' };
  }

  redirect(data.url);
}

/**
 * "No such account" as GoTrue reports it: modern releases set the error code,
 * older ones only a 404 with that message. Anything else must NOT be read as
 * "the address is free".
 */
function isUserNotFoundError(error: AuthError): boolean {
  return (
    error.code === 'user_not_found' ||
    (error.status === 404 && /user not found/i.test(error.message))
  );
}

/**
 * Passwordless sign-in via emailed magic link. Used inside in-app browsers
 * (Instagram/Facebook WebViews) where Google OAuth is blocked
 * ("Error 403: disallowed_useragent") and asking for a password adds friction
 * to cold social traffic. Reuses the same admin.generateLink + Resend path as
 * signup/password-reset so branding and deliverability stay consistent.
 *
 * Works for both new and returning users: `magiclink` only generates a link for
 * an existing account, so if the email is new we create the account first
 * (email_confirm:true — the magic link itself is the verification) and retry.
 */
export async function signInWithMagicLink(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const locale = (formData.get('locale') as string) || 'pl';
  const next = safeNextPath(formData.get('next'));
  const emailLocale = resolveEmailLocale(locale);

  if (!email) {
    return { error: 'Email is required' };
  }

  if (await isAuthEmailRateLimited('magiclink', email)) {
    return { error: RATE_LIMITED_ERROR };
  }

  try {
    const admin = createAdminClient();
    const redirectTo = `${SITE_URL}/${locale}/auth/callback`;

    let { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    if (error) {
      // Only a genuinely absent account may fall through to createUser. On any
      // other failure (banned user, provider disabled, upstream 5xx) creating
      // the account would hand a confirmed, unowned account to whoever typed
      // the address, and squat it before its real owner ever signs up.
      if (!isUserNotFoundError(error)) {
        console.error('[auth] Magic link generation failed:', error);
        captureServerException(error, {
          distinctId: email,
          properties: {
            source: 'auth',
            action: 'magic_link',
            code: error.code,
            status: error.status,
          },
        });
        await flushPostHog();
        return { error: GENERIC_AUTH_ERROR };
      }

      // No account yet — the common case for social traffic. email_confirm:true
      // because the emailed link is itself the verification. A parallel request
      // may win the create; the retry below is what decides either way.
      await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
      ({ data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      }));
    }

    if (error) {
      console.error('[auth] Magic link generation failed after account create:', error);
      captureServerException(error, {
        distinctId: email,
        properties: {
          source: 'auth',
          action: 'magic_link',
          code: error.code,
          status: error.status,
        },
      });
      await flushPostHog();
      // Deliberately generic: the reply must not differ between an address that
      // exists and one that doesn't.
      return { error: GENERIC_AUTH_ERROR };
    }

    const hashedToken = data?.properties?.hashed_token;

    if (hashedToken) {
      // Point the email at an interstitial confirm page — NOT directly at the
      // callback. Magic-link tokens are single-use, and mail scanners / link
      // previews (Gmail, iMessage, antispam) GET links in the email body, which
      // would consume the token on the callback's GET before the user clicks.
      // The confirm page doesn't verify on load; the token is only spent when
      // the user taps "sign in" there (same prefetch-safe shape as the
      // password-reset flow). `next` is carried through to the callback.
      const magicUrl = localeUrl(
        emailLocale,
        `/auth/magic-link/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink${
          next ? `&next=${encodeURIComponent(next)}` : ''
        }`,
      );

      await sendEmail({
        to: email,
        locale: emailLocale,
        template: 'magicLink',
        data: { magicUrl, expiresInHours: MAGIC_LINK_EXPIRES_IN_HOURS },
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[auth] Magic link request failed:', err);
    captureServerException(err, {
      distinctId: email,
      properties: { source: 'auth', action: 'magic_link' },
    });
    await flushPostHog();
    return { error: GENERIC_AUTH_ERROR };
  }
}

export async function signOut(locale?: string) {
  const supabase = await createClient();
  // `local` scope only clears this device's session (no global token-revocation
  // round-trip to the Supabase Auth server), making logout feel instant.
  await supabase.auth.signOut({ scope: 'local' });
  const targetLocale =
    locale && routing.locales.includes(locale as (typeof routing.locales)[number])
      ? locale
      : routing.defaultLocale;
  redirect(`/${targetLocale}`);
}

export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const locale = (formData.get('locale') as string) || 'pl';
  const emailLocale = resolveEmailLocale(locale);

  if (email) {
    // Silent by design: this endpoint always answers `success`, so a throttled
    // caller must not be able to tell a limited address from an unknown one.
    if (await isAuthEmailRateLimited('reset', email)) {
      return { success: true };
    }

    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${SITE_URL}/${locale}/auth/reset-password`,
        },
      });

      const hashedToken = data?.properties?.hashed_token;

      if (!error && hashedToken) {
        const resetUrl = localeUrl(
          emailLocale,
          `/auth/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`,
        );

        await sendEmail({
          to: email,
          locale: emailLocale,
          template: 'passwordReset',
          data: { resetUrl, expiresInHours: RESET_EXPIRES_IN_HOURS },
        });
      }
    } catch (err) {
      console.error('[auth] Password reset request failed:', err);
      captureServerException(err, {
        distinctId: email,
        properties: { source: 'auth', action: 'request_password_reset' },
      });
      await flushPostHog();
    }
  }

  return { success: true };
}

export async function resetPassword(
  tokenHash: string,
  password: string,
): Promise<{ success?: true; error?: 'invalid' | 'failed' }> {
  const supabase = await createClient();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  });

  if (verifyError) {
    return { error: 'invalid' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    return { error: 'failed' };
  }

  return { success: true };
}
