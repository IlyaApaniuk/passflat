import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, ListingExpiringEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function ListingExpiringEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: ListingExpiringEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('listingExpiring.footer')}
      preview={t('listingExpiring.intro', {
        title: data.title,
        days: data.daysLeft,
      })}
    >
      <Text style={contentStyles.heading}>{t('listingExpiring.heading')}</Text>
      <Text style={contentStyles.subheading}>
        {t('listingExpiring.intro', { title: data.title, days: data.daysLeft })}
      </Text>

      <Text style={contentStyles.bodyText}>{t('listingExpiring.body')}</Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.listingUrl} label={t('listingExpiring.cta')} />
      </Section>
    </EmailLayout>
  );
}
