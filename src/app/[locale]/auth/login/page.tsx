import { headers } from 'next/headers';
import { isWebViewUserAgent } from '@/lib/webview';
import { safeNextPath } from '@/lib/safe-next-path';
import { LoginForm } from './login-form';
import { MagicLinkForm } from '../magic-link-form';

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next) ?? undefined;

  // Inside in-app browsers (Instagram/Facebook WebViews) Google OAuth is blocked,
  // so serve the passwordless magic-link form instead. Normal browsers keep the
  // existing Google + email/password flow unchanged.
  const userAgent = (await headers()).get('user-agent');
  if (isWebViewUserAgent(userAgent)) {
    return <MagicLinkForm next={next} />;
  }

  return <LoginForm next={next} error={searchParams.error} />;
}
