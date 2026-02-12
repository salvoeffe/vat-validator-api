/**
 * Input validation for VAT numbers and country codes (EU VIES).
 * Validates format before calling VIES to fail fast on bad input.
 */

/** EU/EEA country codes supported by VIES (including Northern Ireland XI). */
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE",
  "SI", "SK", "XI",
]);

/** Two-letter uppercase country code. */
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

/** VAT number after normalization: only letters and digits, 2–12 chars (covers all EU formats). */
const VAT_NUMBER_REGEX = /^[A-Z0-9]{2,12}$/;

/** Max length for raw vat_number input (before normalize) to prevent huge payloads. */
const MAX_VAT_INPUT_LENGTH = 20;

export interface ValidationResult {
  valid: true;
  countryCode: string;
  vatNumber: string;
}

export interface ValidationError {
  valid: false;
  error: "Invalid Input";
  message: string;
}

export type ValidationOutcome = ValidationResult | ValidationError;

/**
 * Normalizes VAT input: uppercase, strip spaces and dashes.
 */
export function normalizeVatNumber(vat: string): string {
  return vat.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

/**
 * Validates country code (must be a VIES-supported EU country).
 */
export function validateCountryCode(countryCode: string): ValidationError | null {
  const code = countryCode.toUpperCase();
  if (!COUNTRY_CODE_REGEX.test(code)) {
    return {
      valid: false,
      error: "Invalid Input",
      message: "countryCode must be a two-letter ISO country code (e.g. IE, DE).",
    };
  }
  if (!EU_COUNTRY_CODES.has(code)) {
    return {
      valid: false,
      error: "Invalid Input",
      message: `Unsupported or invalid country code: ${code}. Must be an EU/EEA code supported by VIES (e.g. IE, DE, FR).`,
    };
  }
  return null;
}

/**
 * Validates VAT number string (after normalization): length and allowed characters.
 */
export function validateVatNumber(vatNumber: string): ValidationError | null {
  if (!vatNumber) {
    return {
      valid: false,
      error: "Invalid Input",
      message: "vatNumber is required and cannot be empty.",
    };
  }
  if (!VAT_NUMBER_REGEX.test(vatNumber)) {
    return {
      valid: false,
      error: "Invalid Input",
      message: "vatNumber must contain only letters and digits (2–12 characters after removing spaces/dashes).",
    };
  }
  return null;
}

/**
 * Validates raw vat_number query param (full identifier like IE6388047V).
 * Returns normalized countryCode and vatNumber, or a validation error.
 */
export function validateFullVatInput(raw: string): ValidationOutcome {
  if (typeof raw !== "string") {
    return {
      valid: false,
      error: "Invalid Input",
      message: "vat_number must be a string (e.g. ?vat_number=IE6388047V).",
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "Invalid Input",
      message: "Query parameter vat_number is required (e.g. ?vat_number=IE6388047V).",
    };
  }
  if (trimmed.length > MAX_VAT_INPUT_LENGTH) {
    return {
      valid: false,
      error: "Invalid Input",
      message: `vat_number is too long (max ${MAX_VAT_INPUT_LENGTH} characters).`,
    };
  }
  if (trimmed.length < 4) {
    return {
      valid: false,
      error: "Invalid Input",
      message: "vat_number must start with a two-letter country code followed by the VAT number (e.g. IE6388047V).",
    };
  }
  const countryCode = trimmed.slice(0, 2).toUpperCase();
  const vatNumber = normalizeVatNumber(trimmed.slice(2));

  const countryError = validateCountryCode(countryCode);
  if (countryError) {
    return { ...countryError, message: "vat_number must start with a valid EU country code (e.g. IE6388047V)." };
  }

  const vatError = validateVatNumber(vatNumber);
  if (vatError) return vatError;

  return { valid: true, countryCode, vatNumber };
}

/**
 * Validates path params: countryCode and vatNumber separately.
 */
export function validatePathParams(
  countryCode: string,
  vatNumberRaw: string
): ValidationOutcome {
  const code = (countryCode ?? "").toUpperCase();
  const vatNumber = normalizeVatNumber(vatNumberRaw ?? "");

  const countryError = validateCountryCode(code);
  if (countryError) return countryError;

  const vatError = validateVatNumber(vatNumber);
  if (vatError) return vatError;

  return { valid: true, countryCode: code, vatNumber };
}
