const INTERNAL_ORIGIN = 'https://passflat.invalid';
const MAX_NEXT_PATH_LENGTH = 2_048;

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function hasUnsafePathShape(value: string): boolean {
  return (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    containsControlCharacter(value)
  );
}

/**
 * Accept an auth return target only when it is an internal absolute path.
 * Decode a few layers for validation so encoded slashes/backslashes cannot be
 * turned into a protocol-relative URL by a later redirect hop.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_NEXT_PATH_LENGTH) {
    return null;
  }

  let decoded = value;
  try {
    for (let depth = 0; depth < 3; depth += 1) {
      if (hasUnsafePathShape(decoded)) return null;
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    }
  } catch {
    return null;
  }
  if (hasUnsafePathShape(decoded)) return null;

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return null;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // WHATWG URL resolution removes dot segments. Inputs such as
    // `/a/..//evil.example` therefore become protocol-relative only after
    // parsing, so validate the normalized target as well.
    if (hasUnsafePathShape(normalized)) return null;
    const reparsed = new URL(normalized, INTERNAL_ORIGIN);
    return reparsed.origin === INTERNAL_ORIGIN ? normalized : null;
  } catch {
    return null;
  }
}
