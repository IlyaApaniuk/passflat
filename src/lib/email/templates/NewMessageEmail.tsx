import { Section, Text } from '@react-email/components';
import * as React from 'react';
import type { EmailTranslator, NewMessageEmailData } from '../types';
import { contentStyles, EmailButton, EmailLayout } from './EmailLayout';

export function NewMessageEmail({ t, data }: { t: EmailTranslator; data: NewMessageEmailData }) {
  return (
    <EmailLayout
      brand={t('common.brand')}
      footer={t('newMessage.footer')}
      preview={t('newMessage.heading', { listingTitle: data.listingTitle })}
    >
      <Text style={contentStyles.heading}>
        {t('newMessage.heading', { listingTitle: data.listingTitle })}
      </Text>
      <Text style={contentStyles.subheading}>
        {t('newMessage.from', { senderName: data.senderName })}
      </Text>

      <Section style={contentStyles.card}>
        <Text style={contentStyles.bodyText}>{data.messageText}</Text>
      </Section>

      <Section style={contentStyles.actions}>
        <EmailButton href={data.conversationUrl} label={t('newMessage.cta')} />
      </Section>
    </EmailLayout>
  );
}
