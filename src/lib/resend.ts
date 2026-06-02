import { resend } from '@/lib/email/client';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailLocale, type EmailLocale } from '@/lib/email/types';

export { resend };

const TEAM_EMAIL = process.env.CONTACT_EMAIL || 'contact@passflat.com';

interface ContactFormEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactFormEmail(params: ContactFormEmailParams) {
  return sendEmail({
    to: TEAM_EMAIL,
    locale: 'pl',
    replyTo: params.email,
    template: 'contact',
    data: params,
  });
}

interface NewMessageEmailParams {
  to: string;
  locale?: string;
  listingTitle: string;
  senderName: string;
  messageText: string;
  conversationUrl: string;
}

export async function sendNewMessageEmail(params: NewMessageEmailParams) {
  const { to, locale, ...data } = params;
  return sendEmail({
    to,
    locale: resolveEmailLocale(locale),
    template: 'newMessage',
    data,
  });
}

interface NewInquiryEmailParams {
  to: string;
  locale?: string;
  listingTitle: string;
  responderName: string;
  responderEmail: string;
  responderPhone?: string;
  message: string;
  listingUrl: string;
  dashboardUrl: string;
}

export async function sendNewInquiryEmail(params: NewInquiryEmailParams) {
  const { to, locale, ...data } = params;
  return sendEmail({
    to,
    locale: resolveEmailLocale(locale),
    template: 'newInquiry',
    data,
  });
}

interface PaymentConfirmationEmailParams {
  to: string;
  locale: string;
  productType: string;
  paidListing?: boolean;
  promoteDays?: number;
  tierDays?: number;
  amount: number; // in minor units (grosz)
  currency: string;
  termsUrl: string;
  date: Date;
}

export async function sendPaymentConfirmationEmail(params: PaymentConfirmationEmailParams) {
  const { to, locale, ...data } = params;
  return sendEmail({
    to,
    locale: resolveEmailLocale(locale),
    template: 'payment',
    data,
  });
}

interface RefundEmailParams {
  to: string;
  locale: string;
  productType: string;
  amount: number; // in minor units (grosz)
  currency: string;
  dashboardUrl: string;
  date: Date;
}

export async function sendRefundEmail(params: RefundEmailParams) {
  const { to, locale, ...data } = params;
  return sendEmail({
    to,
    locale: resolveEmailLocale(locale),
    template: 'refund',
    data,
  });
}

export type { EmailLocale };
