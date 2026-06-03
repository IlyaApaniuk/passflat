'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site-url';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailLocale } from '@/lib/email/types';
import { localeUrl } from '@/lib/email/url';
import { captureServerException, flushPostHog } from '@/lib/posthog-server';

const RESET_EXPIRES_IN_HOURS = 1;

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const next = formData.get('next') as string | null;
  const locale = (formData.get('locale') as string) || 'pl';

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(next || `/${locale}/dashboard`);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const locale = (formData.get('locale') as string) || 'pl';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/${locale}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signInWithGoogle(locale: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${SITE_URL}/${locale}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return { error: error?.message || 'Failed to initiate Google sign-in' };
  }

  redirect(data.url);
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
