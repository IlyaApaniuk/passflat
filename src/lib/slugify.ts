const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
  ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n",
  Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

export function transliterate(str: string): string {
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_MAP[ch] ?? ch);
}

export function generateBuildingSlug(street: string, buildingNumber: string): string {
  const raw = `${street} ${buildingNumber}`;
  return transliterate(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
