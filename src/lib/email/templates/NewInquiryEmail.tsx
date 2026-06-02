import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, NewInquiryEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function NewInquiryEmail({ t, data }: { t: EmailTranslator; data: NewInquiryEmailData }) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('newInquiry.footer')}
      preview={t('newInquiry.intro', { listingTitle: data.listingTitle })}
    >
      <Text style={contentStyles.heading}>{t('newInquiry.heading')}</Text>
      <Text style={contentStyles.subheading}>
        {t('newInquiry.intro', { listingTitle: data.listingTitle })}
      </Text>

      <Section style={contentStyles.card}>
        <Text style={contentStyles.row}>
          <strong>{t('newInquiry.fromLabel')}</strong> {data.responderName}
        </Text>
        <Text style={contentStyles.row}>
          <strong>{t('newInquiry.emailLabel')}</strong>{' '}
          <Link href={`mailto:${data.responderEmail}`} style={contentStyles.link}>
            {data.responderEmail}
          </Link>
        </Text>
        {data.responderPhone ? (
          <Text style={contentStyles.row}>
            <strong>{t('newInquiry.phoneLabel')}</strong>{' '}
            <Link href={`tel:${data.responderPhone}`} style={contentStyles.link}>
              {data.responderPhone}
            </Link>
          </Text>
        ) : null}
        <Text style={contentStyles.rowLast}>
          <strong>{t('newInquiry.messageLabel')}</strong>
        </Text>
        <Text style={contentStyles.bodyText}>{data.message}</Text>
      </Section>

      <Section style={contentStyles.actions}>
        <EmailButton
          href={data.listingUrl}
          label={t('newInquiry.viewListing')}
          style={{ marginRight: '8px' }}
        />
        <EmailButton
          href={data.dashboardUrl}
          label={t('newInquiry.dashboard')}
          variant="secondary"
        />
      </Section>
    </EmailLayout>
  );
}
