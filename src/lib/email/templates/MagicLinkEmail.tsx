import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, MagicLinkEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function MagicLinkEmail({ t, data }: { t: EmailTranslator; data: MagicLinkEmailData }) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('magicLink.footer')}
      preview={t('magicLink.heading')}
    >
      <Text style={contentStyles.heading}>{t('magicLink.heading')}</Text>
      <Text style={contentStyles.subheading}>{t('magicLink.intro')}</Text>

      <Section style={{ ...contentStyles.actions, margin: '8px 0 28px' }}>
        <EmailButton href={data.magicUrl} label={t('magicLink.cta')} />
      </Section>

      <Text style={contentStyles.bodyText}>{t('magicLink.fallback')}</Text>
      <Text style={{ ...contentStyles.bodyText, ...contentStyles.link }}>{data.magicUrl}</Text>

      <Text style={contentStyles.bodyText}>{t('magicLink.ignoreNotice')}</Text>

      {/* Expiry note sits at the bottom as a quiet footnote — it's secondary
          info and crowded the CTA when placed right under the button. */}
      <Section style={{ ...contentStyles.notice, marginTop: '28px', marginBottom: 0 }}>
        <Text style={contentStyles.noticeText}>
          {t('magicLink.expiryNotice', { hours: data.expiresInHours })}
        </Text>
      </Section>
    </EmailLayout>
  );
}
