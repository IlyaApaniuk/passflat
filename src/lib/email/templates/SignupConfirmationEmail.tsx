import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, SignupConfirmationEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function SignupConfirmationEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: SignupConfirmationEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('signupConfirmation.footer')}
      preview={t('signupConfirmation.heading')}
    >
      <Text style={contentStyles.heading}>{t('signupConfirmation.heading')}</Text>
      <Text style={contentStyles.subheading}>{t('signupConfirmation.intro')}</Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.confirmUrl} label={t('signupConfirmation.cta')} />
      </Section>

      <Text style={contentStyles.bodyText}>{t('signupConfirmation.fallback')}</Text>
      <Text style={{ ...contentStyles.bodyText, ...contentStyles.link }}>{data.confirmUrl}</Text>

      <Text style={contentStyles.bodyText}>{t('signupConfirmation.ignoreNotice')}</Text>
    </EmailLayout>
  );
}
