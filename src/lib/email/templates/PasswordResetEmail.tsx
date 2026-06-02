import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, PasswordResetEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function PasswordResetEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: PasswordResetEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('passwordReset.footer')}
      preview={t('passwordReset.heading')}
    >
      <Text style={contentStyles.heading}>{t('passwordReset.heading')}</Text>
      <Text style={contentStyles.subheading}>{t('passwordReset.intro')}</Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.resetUrl} label={t('passwordReset.cta')} />
      </Section>

      <Section style={contentStyles.notice}>
        <Text style={contentStyles.noticeText}>
          {t('passwordReset.expiryNotice', { hours: data.expiresInHours })}
        </Text>
      </Section>

      <Text style={contentStyles.bodyText}>{t('passwordReset.fallback')}</Text>
      <Text style={{ ...contentStyles.bodyText, ...contentStyles.link }}>{data.resetUrl}</Text>

      <Text style={contentStyles.bodyText}>{t('passwordReset.ignoreNotice')}</Text>
    </EmailLayout>
  );
}
