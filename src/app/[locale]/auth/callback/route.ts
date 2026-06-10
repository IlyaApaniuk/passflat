import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateProfile } from '@/lib/profile';
import { trackServerEvent, identifyUser } from '@/lib/posthog-server';
import { classifyRef } from '@/lib/referral';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | undefined;
  const next = searchParams.get('next') || `/${locale}/dashboard`;

  const supabase = await createClient();
  let authenticated = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authenticated = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    authenticated = !error;
  }

  if (authenticated) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const existingProfile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { id: true },
      });

      const isNewUser = !existingProfile;

      const profile = await getOrCreateProfile(user, locale);

      // Auto-link any cost reports imported with this user's email (e.g. early
      // Google Form submissions) to their account on first matching login.
      if (user.email) {
        try {
          const claimed = await prisma.costReport.updateMany({
            where: { importedEmail: user.email.toLowerCase(), claimedAt: null },
            data: { authorId: user.id, claimedAt: new Date() },
          });
          if (claimed.count > 0) {
            await prisma.profile.update({
              where: { id: user.id },
              data: { hasContributedCost: true },
            });
            trackServerEvent(user.id, 'imported_cost_reports_claimed', {
              count: claimed.count,
            });
          }
        } catch (claimErr) {
          console.error('[auth callback] failed to claim imported cost reports', claimErr);
        }
      }

      const authMethod = user.app_metadata?.provider === 'google' ? 'google' : 'email';

      // First-touch referral source (set once on create). Attach as set-once
      // person properties so PostHog cohorts can split retention/contribution by
      // the channel/influencer that acquired the user. No reward in Phase 1.
      const referralProps = profile.referredBy
        ? { referred_by: profile.referredBy, referral_type: classifyRef(profile.referredBy) }
        : {};

      identifyUser(
        user.id,
        {
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split('@')[0],
          auth_method: authMethod,
          locale,
        },
        { signup_date: new Date().toISOString(), ...referralProps },
      );

      if (isNewUser) {
        trackServerEvent(user.id, 'user_signed_up', {
          method: authMethod,
          locale,
          ...referralProps,
        });
        if (profile.referredBy) {
          trackServerEvent(user.id, 'referred_signup', referralProps);
        }
      }
    }

    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL(`/${locale}/auth/login?error=auth`, request.url));
}
