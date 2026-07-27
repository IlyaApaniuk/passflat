import { MagicLinkConfirm } from './confirm-client';
import { safeNextPath } from '@/lib/safe-next-path';

/**
 * Interstitial page for the magic-link email. It deliberately does NOT verify
 * the token on load — magic-link tokens are single-use, and mail scanners /
 * link previews GET the email link, which would burn the token before the user
 * clicks. The token is only consumed when the user taps the button here, which
 * navigates to /auth/callback (the existing verify + post-auth flow).
 */
export default async function MagicLinkConfirmPage(props: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const searchParams = await props.searchParams;
  const tokenHash = searchParams.type === 'magiclink' ? searchParams.token_hash : undefined;
  const next = safeNextPath(searchParams.next) ?? undefined;

  return <MagicLinkConfirm tokenHash={tokenHash} next={next} />;
}
