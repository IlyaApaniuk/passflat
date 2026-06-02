import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { CityLaunchEmailData, EmailTranslator } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function CityLaunchEmail({ t, data }: { t: EmailTranslator; data: CityLaunchEmailData }) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('cityLaunch.footer')}
      preview={t('cityLaunch.heading', { city: data.cityName })}
    >
      <Text style={contentStyles.heading}>{t('cityLaunch.heading', { city: data.cityName })}</Text>
      <Text style={contentStyles.subheading}>{t('cityLaunch.intro', { city: data.cityName })}</Text>

      <Text style={contentStyles.bodyText}>{t('cityLaunch.body', { city: data.cityName })}</Text>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.cityUrl} label={t('cityLaunch.cta')} />
      </Section>
    </EmailLayout>
  );
}
