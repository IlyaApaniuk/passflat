/**
 * Detect in-app browsers (WebViews) such as Instagram, Facebook, TikTok, etc.
 *
 * Google blocks OAuth inside these embedded browsers ("Error 403:
 * disallowed_useragent" / "Use secure browsers" policy). Rather than trying to
 * eject the user into Safari/Chrome (fragile across iOS/Android and loses the
 * session), we detect the WebView and swap the auth UI to a passwordless
 * magic-link flow, which works fine inside the WebView.
 *
 * This runs server-side off the request `user-agent` header, so the right form
 * renders on first paint (no hydration flash). It is intentionally additive:
 * the normal-browser flow (Google + email/password) is unaffected.
 */
const WEBVIEW_PATTERNS: RegExp[] = [
  // Facebook family (Facebook, Messenger, Instagram in-app browsers)
  /\bFB(?:AN|AV|_IAB|IOS|SS|_HVC|DV|MD|SN|CR|LC|BK|RV)/i,
  /\bInstagram/i,
  /\bMessenger(?:ForiOS)?/i,
  // Other common social in-app browsers
  /\b(?:TikTok|musical_ly|Bytedance(?:Webview)?)/i,
  /\bLine\//i,
  /\bSnapchat/i,
  /\bTwitter\b/i,
  /\bPinterest/i,
  /\bWhatsApp/i,
  /\bKAKAOTALK/i,
  /\bGSA\//i, // Google app in-app browser
  // Android System WebView marker
  /;\s*wv[);]/i,
];

export function isWebViewUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;

  if (WEBVIEW_PATTERNS.some((re) => re.test(ua))) return true;

  // iOS in-app browsers render with AppleWebKit but omit the "Safari" token that
  // real mobile Safari always appends. If it's iOS WebKit without "Safari" and
  // not one of the known standalone browsers, treat it as a WebView.
  const isIOS = /\b(iPhone|iPod|iPad)\b/i.test(ua) && /AppleWebKit/i.test(ua);
  if (isIOS) {
    const isStandaloneBrowser = /\b(Safari|CriOS|FxiOS|EdgiOS|OPiOS)\b/i.test(ua);
    if (!isStandaloneBrowser) return true;
  }

  return false;
}
