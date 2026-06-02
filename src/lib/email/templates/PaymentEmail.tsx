import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, PaymentEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

function buildItemLines(t: EmailTranslator, data: PaymentEmailData): string[] {
  const lines: string[] = [];
  if (data.productType === 'listing') {
    if (data.paidListing) lines.push(t('payment.items.listingFee'));
    if (data.promoteDays && data.promoteDays > 0) {
      lines.push(t('payment.items.promotion', { days: data.promoteDays }));
    }
  } else if (data.productType === 'cost_access' && data.tierDays && data.tierDays > 0) {
    lines.push(t('payment.items.costAccess', { days: data.tierDays }));
  }
  if (lines.length === 0) lines.push(t('payment.itemsLabel'));
  return lines;
}

export function PaymentEmail({ t, data }: { t: EmailTranslator; data: PaymentEmailData }) {
  const itemLines = buildItemLines(t, data);
  const formattedAmount = `${(data.amount / 100).toFixed(2)} ${data.currency.toUpperCase()}`;
  const formattedDate = data.date.toISOString().slice(0, 10);

  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('payment.footer')}
      preview={t('payment.heading')}
    >
      <Text style={contentStyles.heading}>{t('payment.heading')}</Text>
      <Text style={contentStyles.subheading}>{t('payment.intro')}</Text>

      <Section style={contentStyles.card}>
        <Text style={contentStyles.row}>
          <strong>{t('payment.itemsLabel')}:</strong>
        </Text>
        <ul
          style={{
            margin: '0 0 16px',
            paddingLeft: '18px',
            fontSize: '14px',
            color: '#3f3f46',
          }}
        >
          {itemLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <Text style={contentStyles.row}>
          <strong>{t('payment.amountLabel')}:</strong> {formattedAmount}
        </Text>
        <Text style={contentStyles.rowLast}>
          <strong>{t('payment.dateLabel')}:</strong> {formattedDate}
        </Text>
      </Section>

      <Section style={contentStyles.notice}>
        <Text style={contentStyles.noticeText}>{t('payment.waiverNotice')}</Text>
      </Section>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.termsUrl} label={t('payment.termsCta')} />
      </Section>
    </EmailLayout>
  );
}
