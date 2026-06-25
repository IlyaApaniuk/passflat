import { render } from '@react-email/render';
import { getTranslations } from 'next-intl/server';
import * as React from 'react';
import { captureServerException, flushPostHog } from '@/lib/posthog-server';
import { resend } from './client';
import { CityLaunchEmail } from './templates/CityLaunchEmail';
import { CityNotifyConfirmationEmail } from './templates/CityNotifyConfirmationEmail';
import { BuildingActivityEmail } from './templates/BuildingActivityEmail';
import { ContactEmail } from './templates/ContactEmail';
import { CostReportRefreshEmail } from './templates/CostReportRefreshEmail';
import { ListingExpiringEmail } from './templates/ListingExpiringEmail';
import { NewInquiryEmail } from './templates/NewInquiryEmail';
import { NewMessageEmail } from './templates/NewMessageEmail';
import { PasswordResetEmail } from './templates/PasswordResetEmail';
import { MagicLinkEmail } from './templates/MagicLinkEmail';
import { SignupConfirmationEmail } from './templates/SignupConfirmationEmail';
import { PaymentEmail } from './templates/PaymentEmail';
import { RefundEmail } from './templates/RefundEmail';
import type { EmailLocale, EmailTemplate, EmailTranslator } from './types';

const FROM_EMAIL = process.env.RESEND_FROM || 'Passflat <noreply@passflat.com>';

// Retry transient send failures (network/Resend hiccups) with exponential backoff.
// Render/translate failures are deterministic and are NOT retried.
const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_RETRY_BASE_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildEmail(
  t: EmailTranslator,
  spec: EmailTemplate,
): { subject: string; element: React.ReactElement } {
  switch (spec.template) {
    case 'contact':
      return {
        subject: t('contact.subject', { subject: spec.data.subject }),
        element: React.createElement(ContactEmail, { t, data: spec.data }),
      };
    case 'newMessage':
      return {
        subject: t('newMessage.subject', {
          listingTitle: spec.data.listingTitle,
        }),
        element: React.createElement(NewMessageEmail, { t, data: spec.data }),
      };
    case 'newInquiry':
      return {
        subject: t('newInquiry.subject', {
          listingTitle: spec.data.listingTitle,
        }),
        element: React.createElement(NewInquiryEmail, { t, data: spec.data }),
      };
    case 'payment':
      return {
        subject: t('payment.subject'),
        element: React.createElement(PaymentEmail, { t, data: spec.data }),
      };
    case 'refund':
      return {
        subject: t('refund.subject'),
        element: React.createElement(RefundEmail, { t, data: spec.data }),
      };
    case 'passwordReset':
      return {
        subject: t('passwordReset.subject'),
        element: React.createElement(PasswordResetEmail, { t, data: spec.data }),
      };
    case 'magicLink':
      return {
        subject: t('magicLink.subject'),
        element: React.createElement(MagicLinkEmail, { t, data: spec.data }),
      };
    case 'cityNotifyConfirmation':
      return {
        subject: t('cityNotifyConfirmation.subject', {
          city: spec.data.cityName,
        }),
        element: React.createElement(CityNotifyConfirmationEmail, {
          t,
          data: spec.data,
        }),
      };
    case 'cityLaunch':
      return {
        subject: t('cityLaunch.subject', { city: spec.data.cityName }),
        element: React.createElement(CityLaunchEmail, { t, data: spec.data }),
      };
    case 'signupConfirmation':
      return {
        subject: t('signupConfirmation.subject'),
        element: React.createElement(SignupConfirmationEmail, {
          t,
          data: spec.data,
        }),
      };
    case 'listingExpiring':
      return {
        subject: t('listingExpiring.subject', { title: spec.data.title }),
        element: React.createElement(ListingExpiringEmail, {
          t,
          data: spec.data,
        }),
      };
    case 'buildingActivity':
      return {
        subject: t('buildingActivity.subject', {
          count: spec.data.newReports,
          address: spec.data.buildingAddress,
        }),
        element: React.createElement(BuildingActivityEmail, {
          t,
          data: spec.data,
        }),
      };
    case 'costReportRefresh':
      return {
        subject: t('costReportRefresh.subject'),
        element: React.createElement(CostReportRefreshEmail, {
          t,
          data: spec.data,
        }),
      };
  }
}

type SendEmailArgs = {
  to: string;
  locale: EmailLocale;
  replyTo?: string;
} & EmailTemplate;

export async function sendEmail(args: SendEmailArgs) {
  const { to, locale, replyTo, ...spec } = args;

  try {
    const t = await getTranslations({ locale, namespace: 'emails' });
    const translate: EmailTranslator = (key, values) => t(key as Parameters<typeof t>[0], values);

    const { subject, element } = buildEmail(translate, spec as EmailTemplate);
    const html = await render(element);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
      const { data, error } = await resend.emails
        .send({ from: FROM_EMAIL, to, replyTo, subject, html })
        .catch((sendErr: unknown) => ({ data: null, error: sendErr }));

      if (!error) {
        return { success: true as const, id: data?.id };
      }

      lastError = error;
      if (attempt < EMAIL_MAX_ATTEMPTS) {
        // Transient failure — back off (500ms, 1s) before the next attempt.
        await sleep(EMAIL_RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }

    console.error(
      `[email] Failed to send "${spec.template}" after ${EMAIL_MAX_ATTEMPTS} attempts:`,
      lastError,
    );
    captureServerException(lastError, {
      properties: { source: 'email_send', template: spec.template, attempts: EMAIL_MAX_ATTEMPTS },
    });
    await flushPostHog();
    return { success: false as const, error: lastError };
  } catch (err) {
    console.error(`[email] Exception sending "${spec.template}" email:`, err);
    captureServerException(err, {
      properties: { source: 'email_send', template: spec.template },
    });
    await flushPostHog();
    return { success: false as const, error: err };
  }
}
