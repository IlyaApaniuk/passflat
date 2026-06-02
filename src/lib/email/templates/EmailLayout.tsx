import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const styles = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily: fontStack,
    background: '#f4f4f5',
    color: '#18181b',
  } as React.CSSProperties,
  container: {
    maxWidth: '560px',
    margin: '40px auto',
    background: '#fff',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #e4e4e7',
  } as React.CSSProperties,
  header: {
    background: '#18181b',
    padding: '24px 32px',
  } as React.CSSProperties,
  brand: {
    margin: 0,
    color: '#fff',
    fontSize: '20px',
    fontWeight: 600,
  } as React.CSSProperties,
  content: {
    padding: '32px',
  } as React.CSSProperties,
  footer: {
    padding: '16px 32px',
    background: '#fafafa',
    borderTop: '1px solid #e4e4e7',
    textAlign: 'center',
  } as React.CSSProperties,
  footerText: {
    margin: 0,
    fontSize: '12px',
    color: '#a1a1aa',
  } as React.CSSProperties,
};

export const buttonStyles = {
  primary: {
    display: 'inline-block',
    background: '#18181b',
    color: '#fff',
    textDecoration: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  secondary: {
    display: 'inline-block',
    background: '#f4f4f5',
    color: '#18181b',
    textDecoration: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
};

export function EmailButton({
  href,
  label,
  variant = 'primary',
  style,
}: {
  href: string;
  label: string;
  variant?: 'primary' | 'secondary';
  style?: React.CSSProperties;
}) {
  return (
    <Button href={href} style={{ ...buttonStyles[variant], ...style }}>
      {label}
    </Button>
  );
}

export function EmailLayout({
  brand,
  footer,
  preview,
  children,
}: {
  brand: string;
  footer: string;
  preview?: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.brand}>{brand}</Heading>
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Section style={styles.footer}>
            <Text style={styles.footerText}>{footer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const contentStyles = {
  heading: {
    margin: '0 0 8px',
    fontSize: '18px',
    fontWeight: 600,
  } as React.CSSProperties,
  subheading: {
    margin: '0 0 24px',
    color: '#71717a',
    fontSize: '14px',
  } as React.CSSProperties,
  card: {
    background: '#f4f4f5',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px',
  } as React.CSSProperties,
  row: {
    margin: '0 0 12px',
    fontSize: '14px',
  } as React.CSSProperties,
  rowLast: {
    margin: 0,
    fontSize: '14px',
  } as React.CSSProperties,
  bodyText: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#3f3f46',
    whiteSpace: 'pre-wrap',
  } as React.CSSProperties,
  link: {
    color: '#2563eb',
  } as React.CSSProperties,
  actions: {
    textAlign: 'center',
  } as React.CSSProperties,
  notice: {
    background: '#fef9c3',
    border: '1px solid #fde047',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  } as React.CSSProperties,
  noticeText: {
    margin: 0,
    fontSize: '13px',
    color: '#713f12',
    lineHeight: 1.5,
  } as React.CSSProperties,
};
