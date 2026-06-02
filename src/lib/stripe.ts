import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
});

export const STRIPE_PRICES = {
  EXTRA_LISTING: process.env.STRIPE_PRICE_EXTRA_LISTING!,
  PROMOTE_7: process.env.STRIPE_PRICE_PROMOTE_7!,
  PROMOTE_14: process.env.STRIPE_PRICE_PROMOTE_14!,
  PROMOTE_30: process.env.STRIPE_PRICE_PROMOTE_30!,
  COST_ACCESS_7: process.env.STRIPE_PRICE_COST_ACCESS_7!,
  COST_ACCESS_30: process.env.STRIPE_PRICE_COST_ACCESS_30!,
  COST_ACCESS_90: process.env.STRIPE_PRICE_COST_ACCESS_90!,
} as const;

export const FREE_LISTING_LIMIT = 2;

// Map the app locale to a Stripe Checkout locale. Stripe does not support
// Ukrainian ('uk'), so it falls back to 'auto'.
export function toStripeLocale(
  locale: string | undefined,
): Stripe.Checkout.SessionCreateParams.Locale {
  switch (locale) {
    case 'pl':
      return 'pl';
    case 'en':
      return 'en';
    case 'ru':
      return 'ru';
    default:
      return 'auto';
  }
}

// Short, non-scary waiver line shown next to the standard "I agree to the Terms"
// checkbox on Stripe Checkout. Localized; falls back to English.
export function checkoutWaiverText(locale: string | undefined): string {
  const messages: Record<string, string> = {
    pl: 'Usługa jest udostępniana natychmiast po płatności. Po jej wykonaniu tracisz 14-dniowe prawo do odstąpienia od umowy.',
    en: 'The service is provided immediately after payment. Once it is provided, you lose the 14-day right of withdrawal.',
    ru: 'Услуга предоставляется сразу после оплаты. После её предоставления вы теряете 14-дневное право на отказ.',
    uk: 'Послуга надається одразу після оплати. Після її надання ви втрачаєте 14-денне право на відмову.',
  };
  return messages[locale ?? 'en'] ?? messages.en;
}
