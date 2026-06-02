import { SITE_URL as BASE_URL } from '@/lib/site-url';

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Passflat',
    url: BASE_URL,
    logo: `${BASE_URL}/icon.svg`,
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'contact@passflat.com',
      contactType: 'customer service',
      availableLanguage: ['Polish', 'English', 'Russian', 'Ukrainian'],
    },
    sameAs: ['https://linkedin.com/company/passflat', 'https://instagram.com/passflat.com'],
  };
}

export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Passflat',
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/warsaw/replacement?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqPageJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function howToJsonLd(
  name: string,
  description: string,
  steps: { name: string; text: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function articleJsonLd(article: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  locale: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: article.url,
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    image: article.image ?? `${BASE_URL}/icon.svg`,
    inLanguage: article.locale,
    author: {
      '@type': 'Organization',
      name: 'Passflat',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Passflat',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/icon.svg`,
      },
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: BASE_URL,
      },
      ...items.map((entry, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: entry.name,
        item: `${BASE_URL}${entry.path}`,
      })),
    ],
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
