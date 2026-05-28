const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_BASE_URL = DEEPL_API_KEY?.endsWith(':fx')
  ? 'https://api-free.deepl.com'
  : 'https://api.deepl.com';

const LOCALE_TO_DEEPL: Record<string, string> = {
  en: 'EN',
  pl: 'PL',
  ru: 'RU',
  uk: 'UK',
};

export interface TranslateResult {
  text: string;
  detectedSourceLang: string;
}

export async function translateTexts(
  texts: string[],
  targetLocale: string,
  sourceLocale?: string | null,
): Promise<TranslateResult[]> {
  if (!DEEPL_API_KEY) {
    throw new Error('DEEPL_API_KEY is not configured');
  }

  const targetLang = LOCALE_TO_DEEPL[targetLocale];
  if (!targetLang) {
    throw new Error(`Unsupported target locale: ${targetLocale}`);
  }

  const nonEmpty = texts.filter((t) => t.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const body: Record<string, unknown> = {
    text: nonEmpty,
    target_lang: targetLang,
  };

  if (sourceLocale && LOCALE_TO_DEEPL[sourceLocale]) {
    body.source_lang = LOCALE_TO_DEEPL[sourceLocale];
  }

  const response = await fetch(`${DEEPL_BASE_URL}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.translations.map((t: { text: string; detected_source_language: string }) => ({
    text: t.text,
    detectedSourceLang: t.detected_source_language.toLowerCase(),
  }));
}
