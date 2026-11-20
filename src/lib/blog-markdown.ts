// The guide renderer: turns a guide's Markdown body into HTML. Pure, so the
// client article and the tests share it (spec 09 §Guide bodies).

// Hosts whose links earn a commission. Drives both the rel="sponsored"
// annotation (Google requires it on paid links) and the click event.
// prf.hn is Partnerize's tracking domain (Wise campaign).
const AFFILIATE_HOSTS = ['connectorlink.online', 'prf.hn'];

// Guides link to Passflat's own pages with absolute URLs; those render as
// same-tab relative links (the path already carries the locale).
const OWN_ORIGIN = 'https://passflat.com';

export function affiliateHost(href: string): string | null {
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return AFFILIATE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? host : null;
  } catch {
    return null;
  }
}

function renderLink(text: string, href: string): string {
  // Own pages open in the same tab: the path alone, no target, no rel.
  if (href.startsWith(`${OWN_ORIGIN}/`)) {
    return `<a href="${href.slice(OWN_ORIGIN.length)}">${text}</a>`;
  }
  if (!/^https?:\/\//.test(href)) return `<a href="${href}">${text}</a>`;
  // External links open in a new tab; affiliate links additionally carry
  // rel="sponsored" (required for paid links) on top of the safety rel.
  const rel = affiliateHost(href) ? 'sponsored nofollow noopener' : 'noopener';
  return `<a href="${href}" target="_blank" rel="${rel}">${text}</a>`;
}

export function markdownToHtml(md: string): string {
  let html = md;

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) =>
    renderLink(text, href),
  );

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${trimmed.slice(2)}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (
        trimmed &&
        !trimmed.startsWith('<h') &&
        !trimmed.startsWith('<ul') &&
        !trimmed.startsWith('<li') &&
        !trimmed.startsWith('</') &&
        !trimmed.startsWith('<ol')
      ) {
        result.push(`<p>${trimmed}</p>`);
      } else if (trimmed) {
        result.push(trimmed);
      }
    }
  }
  if (inList) result.push('</ul>');

  return result.join('\n');
}
