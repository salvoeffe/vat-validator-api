export interface ViesRequest {
  /**
   * Two-letter ISO country code, e.g. "IE".
   */
  countryCode: string;

  /**
   * VAT number without the country code prefix.
   */
  vatNumber: string;
}

export interface ViesResponse {
  /**
   * Whether the VAT number is valid according to VIES.
   */
  valid: boolean;

  countryCode: string;
  vatNumber: string;

  /**
   * Company or trader name returned by VIES.
   */
  name: string;

  /**
   * Company or trader address returned by VIES.
   */
  address: string;

  /**
   * Request date in YYYY-MM-DD format as returned by VIES.
   */
  requestDate: string;

  /**
   * Consultation number / request identifier returned by VIES (if available).
   */
  consultationNumber?: string | null;
}

export interface VatValidationApiResponse {
  /**
   * Whether the VAT number is valid.
   */
  valid: boolean;

  /**
   * Two-letter ISO country code, e.g. "IE".
   */
  country_code: string;

  /**
   * VAT number without the country code prefix, e.g. "6388047V".
   */
  vat_number: string;

  /**
   * Company name (mapped from VIES name).
   */
  company_name: string | null;

  /**
   * Company address (mapped from VIES address).
   */
  address: string | null;

  /**
   * Consultation number / request identifier (if available).
   */
  consultation_number?: string | null;

  /**
   * Date of the consultation as recorded by VIES (YYYY-MM-DD). Useful for audit/tax proof.
   */
  request_date: string | null;

  /**
   * ISO 8601 timestamp when the check was performed (server time).
   */
  checked_at: string;
}

export type ViesFaultCode =
  | "SERVICE_UNAVAILABLE"
  | "MS_UNAVAILABLE"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "SERVER_BUSY"
  | "SERVER_DOWN"
  | "UNKNOWN_ERROR";

