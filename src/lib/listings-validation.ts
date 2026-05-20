export const LISTING_TYPES = ['replacement', 'roommate', 'sublet'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const ROOM_TYPES = ['private', 'shared'] as const;
export const PREFERRED_GENDERS = ['any', 'male', 'female'] as const;

export function isValidListingType(type: unknown): type is ListingType {
  return typeof type === 'string' && LISTING_TYPES.includes(type as ListingType);
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateTypeSpecificFields(
  type: ListingType,
  body: Record<string, unknown>,
): ValidationResult {
  switch (type) {
    case 'replacement':
      if (!body.rent) {
        return { valid: false, error: 'Replacement listings require: rent' };
      }
      return { valid: true };

    case 'roommate':
      if (!body.pricePerPerson) {
        return { valid: false, error: 'Roommate listings require: pricePerPerson' };
      }
      if (body.roomType && !ROOM_TYPES.includes(body.roomType as (typeof ROOM_TYPES)[number])) {
        return { valid: false, error: 'roomType must be "private" or "shared"' };
      }
      if (
        body.preferredGender &&
        !PREFERRED_GENDERS.includes(body.preferredGender as (typeof PREFERRED_GENDERS)[number])
      ) {
        return { valid: false, error: 'preferredGender must be "any", "male", or "female"' };
      }
      if (body.preferredAgeMin != null && body.preferredAgeMax != null) {
        if (Number(body.preferredAgeMin) > Number(body.preferredAgeMax)) {
          return { valid: false, error: 'preferredAgeMin cannot be greater than preferredAgeMax' };
        }
      }
      return { valid: true };

    case 'sublet':
      if (!body.priceTotal) {
        return { valid: false, error: 'Sublet listings require: priceTotal' };
      }
      if (!body.availableFrom || !body.availableTo) {
        return {
          valid: false,
          error: 'Sublet listings require both availableFrom and availableTo dates',
        };
      }
      if (new Date(body.availableTo as string) <= new Date(body.availableFrom as string)) {
        return { valid: false, error: 'availableTo must be after availableFrom' };
      }
      return { valid: true };

    default:
      return { valid: false, error: `Unknown listing type: ${type}` };
  }
}

const REPLACEMENT_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const ROOMMATE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeExpiresAt(type: ListingType, body: Record<string, unknown>): Date {
  switch (type) {
    case 'replacement':
      return new Date(Date.now() + REPLACEMENT_EXPIRY_MS);
    case 'roommate':
      return new Date(Date.now() + ROOMMATE_EXPIRY_MS);
    case 'sublet':
      return new Date(body.availableTo as string);
    default:
      return new Date(Date.now() + REPLACEMENT_EXPIRY_MS);
  }
}

export function computePriceFields(
  type: ListingType,
  body: Record<string, unknown>,
): { totalMonthly: number | null; pricePerPerson: number | null; priceTotal: number | null } {
  switch (type) {
    case 'replacement': {
      const rent = parseFloat(body.rent as string) || 0;
      const adminFee = parseFloat(body.adminFee as string) || 0;
      const utilitiesAvg = parseFloat(body.utilitiesAvg as string) || 0;
      return {
        totalMonthly: rent + adminFee + utilitiesAvg || null,
        pricePerPerson: null,
        priceTotal: null,
      };
    }
    case 'roommate': {
      return {
        totalMonthly: null,
        pricePerPerson: parseFloat(body.pricePerPerson as string) || null,
        priceTotal: null,
      };
    }
    case 'sublet': {
      return {
        totalMonthly: null,
        pricePerPerson: null,
        priceTotal: parseFloat(body.priceTotal as string) || null,
      };
    }
  }
}

/**
 * The field used for price filtering depends on listing type.
 */
export function getPriceFieldForType(type: ListingType | null): string {
  switch (type) {
    case 'roommate':
      return 'pricePerPerson';
    case 'sublet':
      return 'priceTotal';
    case 'replacement':
    default:
      return 'totalMonthly';
  }
}
