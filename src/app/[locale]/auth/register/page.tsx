import { headers } from 'next/headers';
import { isWebViewUserAgent } from '@/lib/webview';
import { safeNextPath } from '@/lib/safe-next-path';
import { RegisterForm } from './register-form';
import { MagicLinkForm } from '../magic-link-form';

export default async function RegisterPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next) ?? undefined;

  // In-app browsers can't use Google OAuth and password signup adds friction for
  // cold social traffic — serve the passwordless magic-link form, which doubles
  // as sign-up (the account is created on first link). Normal browsers unchanged.
  const userAgent = (await headers()).get('user-agent');
  if (isWebViewUserAgent(userAgent)) {
    return <MagicLinkForm next={next} />;
  }

  return <RegisterForm next={next} />;
}
