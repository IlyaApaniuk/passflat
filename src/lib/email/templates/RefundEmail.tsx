import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, RefundEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

function buildProductLabel(t: EmailTranslator, data: RefundEmailData): string {
  if (data.productType === 'listing') return t('refund.products.listing');
  if (data.productType === 'cost_access') return t('refund.products.costAccess');
  return t('refund.products.generic');
}

export function RefundEmail({ t, data }: { t: EmailTranslator; data: RefundEmailData }) {
  const productLabel = buildProductLabel(t, data);
  const formattedAmount = `${(data.amount / 100).toFixed(2)} ${data.currency.toUpperCase()}`;
  const formattedDate = data.date.toISOString().slice(0, 10);

  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('refund.footer')}
      preview={t('refund.heading')}
    >
      <Text style={contentStyles.heading}>{t('refund.heading')}</Text>
      <Text style={contentStyles.subheading}>{t('refund.intro')}</Text>

      <Section style={contentStyles.card}>
        <Text style={contentStyles.row}>
          <strong>{t('refund.itemsLabel')}:</strong> {productLabel}
        </Text>
        <Text style={contentStyles.row}>
          <strong>{t('refund.amountLabel')}:</strong> {formattedAmount}
        </Text>
        <Text style={contentStyles.rowLast}>
          <strong>{t('refund.dateLabel')}:</strong> {formattedDate}
        </Text>
      </Section>

      <Section style={contentStyles.notice}>
        <Text style={contentStyles.noticeText}>{t('refund.processingNotice')}</Text>
      </Section>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.dashboardUrl} label={t('refund.dashboardCta')} />
      </Section>
    </EmailLayout>
  );
}
