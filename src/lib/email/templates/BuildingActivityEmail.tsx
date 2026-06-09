import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { BuildingActivityEmailData, EmailTranslator } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function BuildingActivityEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: BuildingActivityEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('buildingActivity.footer')}
      preview={t('buildingActivity.intro', {
        count: data.newReports,
        address: data.buildingAddress,
      })}
    >
      <Text style={contentStyles.heading}>{t('buildingActivity.heading')}</Text>
      <Text style={contentStyles.subheading}>
        {t('buildingActivity.intro', {
          count: data.newReports,
          address: data.buildingAddress,
        })}
      </Text>

      <Text style={contentStyles.bodyText}>
        {t('buildingActivity.body', { total: data.totalReports })}
      </Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.buildingUrl} label={t('buildingActivity.cta')} />
      </Section>
    </EmailLayout>
  );
}
