const POLISH_MAP: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'a',
  Ć: 'c',
  Ę: 'e',
  Ł: 'l',
  Ń: 'n',
  Ó: 'o',
  Ś: 's',
  Ź: 'z',
  Ż: 'z',
};

// Russian + Ukrainian → Latin, so Cyrillic listing titles still produce a
// readable, SEO-friendly slug (the audience is RU/UA).
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'yi',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function transliterate(str: string): string {
  return str
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_MAP[ch] ?? ch)
    .replace(/[Ѐ-ӿ]/g, (ch) => {
      const lower = ch.toLowerCase();
      const mapped = CYRILLIC_MAP[lower];
      if (mapped === undefined) return ch;
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    });
}

/**
 * URL slug for a listing: transliterated + slugified title plus a short id suffix
 * to guarantee uniqueness (and to survive titles that slugify to nothing). The
 * suffix derives from the listing id, so a listing always maps to the same slug.
 */
export function generateListingSlug(title: string, id: string): string {
  const base = transliterate(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const suffix = id.replace(/-/g, '').slice(0, 8);
  return base ? `${base}-${suffix}` : suffix;
}

export function generateBuildingSlug(street: string, buildingNumber: string): string {
  const raw = `${street} ${buildingNumber}`;
  return transliterate(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
