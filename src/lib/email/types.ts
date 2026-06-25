export type EmailLocale = 'pl' | 'en' | 'ru' | 'uk';

export const EMAIL_LOCALES: readonly EmailLocale[] = ['pl', 'en', 'ru', 'uk'];

export function resolveEmailLocale(locale: string | null | undefined): EmailLocale {
  return (EMAIL_LOCALES as readonly string[]).includes(locale ?? '')
    ? (locale as EmailLocale)
    : 'pl';
}

/**
 * Translation function shape used by email templates. Resolved server-side via
 * next-intl's `getTranslations({ locale, namespace: 'emails' })` and passed into
 * each template so rendering stays request-context-free (works in webhooks/cron).
 */
export type EmailTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export interface ContactEmailData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface NewMessageEmailData {
  listingTitle: string;
  senderName: string;
  messageText: string;
  conversationUrl: string;
}

export interface NewInquiryEmailData {
  listingTitle: string;
  responderName: string;
  responderEmail: string;
  responderPhone?: string;
  message: string;
  listingUrl: string;
  dashboardUrl: string;
}

export interface PaymentEmailData {
  productType: string;
  paidListing?: boolean;
  promoteDays?: number;
  tierDays?: number;
  amount: number; // minor units (grosz)
  currency: string;
  termsUrl: string;
  date: Date;
}

export interface RefundEmailData {
  productType: string;
  amount: number; // minor units (grosz)
  currency: string;
  dashboardUrl: string;
  date: Date;
}

export interface PasswordResetEmailData {
  resetUrl: string;
  expiresInHours: number;
}

export interface MagicLinkEmailData {
  magicUrl: string;
  expiresInHours: number;
}

export interface CityNotifyConfirmationEmailData {
  cityName: string;
}

export interface CityLaunchEmailData {
  cityName: string;
  cityUrl: string;
}

export interface SignupConfirmationEmailData {
  confirmUrl: string;
}

export interface ListingExpiringEmailData {
  title: string;
  listingUrl: string;
  daysLeft: number;
  expiresAt: Date;
}

export interface BuildingActivityEmailData {
  buildingAddress: string;
  newReports: number;
  totalReports: number;
  buildingUrl: string;
  unsubscribeUrl: string;
}

export interface CostReportRefreshEmailData {
  buildingAddress: string;
  monthsAgo: number;
  submitUrl: string;
  unsubscribeUrl: string;
}

export type EmailTemplate =
  | { template: 'contact'; data: ContactEmailData }
  | { template: 'newMessage'; data: NewMessageEmailData }
  | { template: 'newInquiry'; data: NewInquiryEmailData }
  | { template: 'payment'; data: PaymentEmailData }
  | { template: 'refund'; data: RefundEmailData }
  | { template: 'passwordReset'; data: PasswordResetEmailData }
  | { template: 'magicLink'; data: MagicLinkEmailData }
  | {
      template: 'cityNotifyConfirmation';
      data: CityNotifyConfirmationEmailData;
    }
  | { template: 'cityLaunch'; data: CityLaunchEmailData }
  | { template: 'signupConfirmation'; data: SignupConfirmationEmailData }
  | { template: 'listingExpiring'; data: ListingExpiringEmailData }
  | { template: 'buildingActivity'; data: BuildingActivityEmailData }
  | { template: 'costReportRefresh'; data: CostReportRefreshEmailData };
