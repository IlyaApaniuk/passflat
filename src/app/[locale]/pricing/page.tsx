import { notFound } from 'next/navigation';

// /pricing is disabled while monetization is dormant — nothing on the site
// points to purchases. The full page (this file + ./client.tsx with the tier
// cards) is preserved in git history; restore it, and re-add the sitemap +
// footer entries, when paid features are switched back on.
export default function PricingPage() {
  notFound();
}
