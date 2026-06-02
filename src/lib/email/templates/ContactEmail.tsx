import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import type { ContactEmailData, EmailTranslator } from '../types';
import { contentStyles, EmailLayout } from './EmailLayout';

export function ContactEmail({ t, data }: { t: EmailTranslator; data: ContactEmailData }) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('contact.footer', { name: data.name })}
      preview={data.subject}
    >
      <Text style={contentStyles.heading}>{data.subject}</Text>
      <Text style={contentStyles.subheading}>{t('contact.intro')}</Text>

      <Section style={contentStyles.card}>
        <Text style={contentStyles.row}>
          <strong>{t('contact.fromLabel')}</strong> {data.name}
        </Text>
        <Text style={contentStyles.row}>
          <strong>{t('contact.emailLabel')}</strong>{' '}
          <Link href={`mailto:${data.email}`} style={contentStyles.link}>
            {data.email}
          </Link>
        </Text>
        <Text style={contentStyles.rowLast}>
          <strong>{t('contact.messageLabel')}</strong>
        </Text>
        <Text style={contentStyles.bodyText}>{data.message}</Text>
      </Section>
    </EmailLayout>
  );
}
