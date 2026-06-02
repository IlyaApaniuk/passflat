import { Text } from '@react-email/components';
import * as React from 'react';
import type { CityNotifyConfirmationEmailData, EmailTranslator } from '../types';
import { contentStyles, EmailLayout } from './EmailLayout';

export function CityNotifyConfirmationEmail({
  t,
  data,
}: {
  t: EmailTranslator;
  data: CityNotifyConfirmationEmailData;
}) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('cityNotifyConfirmation.footer')}
      preview={t('cityNotifyConfirmation.heading', { city: data.cityName })}
    >
      <Text style={contentStyles.heading}>
        {t('cityNotifyConfirmation.heading', { city: data.cityName })}
      </Text>
      <Text style={contentStyles.subheading}>
        {t('cityNotifyConfirmation.intro', { city: data.cityName })}
      </Text>

      <Text style={contentStyles.bodyText}>
        {t('cityNotifyConfirmation.body', { city: data.cityName })}
      </Text>
    </EmailLayout>
  );
}
