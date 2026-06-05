import { render } from '@react-email/render';
import { getTranslations } from 'next-intl/server';
import * as React from 'react';
import { captureServerException, flushPostHog } from '@/lib/posthog-server';
import { resend } from './client';
import { CityLaunchEmail } from './templates/CityLaunchEmail';
import { CityNotifyConfirmationEmail } from './templates/CityNotifyConfirmationEmail';
import { ContactEmail } from './templates/ContactEmail';
import { ListingExpiringEmail } from './templates/ListingExpiringEmail';
import { NewInquiryEmail } from './templates/NewInquiryEmail';
import { NewMessageEmail } from './templates/NewMessageEmail';
import { PasswordResetEmail } from './templates/PasswordResetEmail';
import { SignupConfirmationEmail } from './templates/SignupConfirmationEmail';
import { PaymentEmail } from './templates/PaymentEmail';
import { RefundEmail } from './templates/RefundEmail';
import type { EmailLocale, EmailTemplate, EmailTranslator } from './types';

const FROM_EMAIL = process.env.RESEND_FROM || 'Passflat <noreply@passflat.com>';

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

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      replyTo,
      subject,
      html,
    });

    if (error) {
      console.error(`[email] Failed to send "${spec.template}" email:`, error);
      captureServerException(error, {
        properties: { source: 'email_send', template: spec.template },
      });
      await flushPostHog();
      return { success: false as const, error };
    }

    return { success: true as const, id: data?.id };
  } catch (err) {
    console.error(`[email] Exception sending "${spec.template}" email:`, err);
    captureServerException(err, {
      properties: { source: 'email_send', template: spec.template },
    });
    await flushPostHog();
    return { success: false as const, error: err };
  }
}
