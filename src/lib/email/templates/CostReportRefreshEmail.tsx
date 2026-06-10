import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { CostReportRefreshEmailData, EmailTranslator } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function CostReportRefreshEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: CostReportRefreshEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('costReportRefresh.footer')}
      unsubscribeUrl={data.unsubscribeUrl}
      unsubscribeLabel={t('unsubscribe')}
      preview={t('costReportRefresh.intro', {
        address: data.buildingAddress,
        months: data.monthsAgo,
      })}
    >
      <Text style={contentStyles.heading}>{t('costReportRefresh.heading')}</Text>
      <Text style={contentStyles.subheading}>
        {t('costReportRefresh.intro', {
          address: data.buildingAddress,
          months: data.monthsAgo,
        })}
      </Text>

      <Text style={contentStyles.bodyText}>{t('costReportRefresh.body')}</Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.submitUrl} label={t('costReportRefresh.cta')} />
      </Section>
    </EmailLayout>
  );
}
