import { headers } from 'next/headers';
import { isWebViewUserAgent } from '@/lib/webview';
import { safeNextPath } from '@/lib/safe-next-path';
import { LoginForm } from './login-form';
import { MagicLinkForm } from '../magic-link-form';

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string; method?: string }>;
}) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next) ?? undefined;

  // Inside in-app browsers (Instagram/Facebook WebViews) Google OAuth is blocked,
  // so the passwordless form is the only way in. Everyone else gets Google +
  // email/password, with `?method=link` as an opt-in: the post-submit "log in to
  // claim your report" hook otherwise drops a first-time visitor into creating a
  // password, which is the heaviest step in the whole funnel.
  const inAppBrowser = isWebViewUserAgent((await headers()).get('user-agent'));
  if (inAppBrowser || searchParams.method === 'link') {
    return <MagicLinkForm next={next} inAppBrowser={inAppBrowser} />;
  }

  return <LoginForm next={next} error={searchParams.error} />;
}
