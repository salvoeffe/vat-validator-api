import axios, { AxiosError } from "axios";
import type { ViesResponse } from "../types";

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

const SOAP_NS = "urn:ec.europa.eu:taxud:vies:services:checkVat:types";

/**
 * Builds the SOAP envelope XML for the VIES checkVat operation.
 */
function buildSoapEnvelope(countryCode: string, vatNumber: string): string {
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${SOAP_NS}">`,
    "  <soap:Body>",
    "    <urn:checkVat>",
    `      <urn:countryCode>${escapeXml(countryCode)}</urn:countryCode>`,
    `      <urn:vatNumber>${escapeXml(vatNumber)}</urn:vatNumber>`,
    "    </urn:checkVat>",
    "  </soap:Body>",
    "</soap:Envelope>",
  ].join("\n");
  return body;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extracts text content of the first matching tag (handles optional namespace prefix).
 * Returns null if not found.
 */
function extractTag(xml: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<[^:>]*:?${tagName}[^>]*>([\\s\\S]*?)</[^:>]*:?${tagName}\\s*>`, "i"),
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}\\s*>`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Parses the VIES SOAP response body into a structured result.
 * Uses lightweight regex extraction (no heavy XML parser).
 * @throws Error if the response is not a valid checkVat response (e.g. missing required elements).
 */
function parseViesResponse(xml: string): ViesResponse {
  const validStr = extractTag(xml, "valid");
  if (validStr === null) {
    throw new Error("VIES response missing required 'valid' element");
  }
  const valid = /^\s*true\s*$/i.test(validStr);

  const countryCode = extractTag(xml, "countryCode") ?? "";
  const vatNumber = extractTag(xml, "vatNumber") ?? "";
  const name = extractTag(xml, "name") ?? "";
  const address = extractTag(xml, "address") ?? "";
  const requestDate = extractTag(xml, "requestDate") ?? "";
  const requestIdentifier = extractTag(xml, "requestIdentifier");

  return {
    valid,
    countryCode,
    vatNumber,
    name,
    address,
    requestDate,
    consultationNumber: requestIdentifier ?? null,
  };
}

/**
 * Checks for SOAP Fault in response and returns faultstring if present.
 */
function getSoapFaultString(xml: string): string | null {
  const faultString = extractTag(xml, "faultstring");
  if (faultString) return faultString.trim();
  return null;
}

export type ViesErrorCode =
  | "SERVICE_UNAVAILABLE"
  | "MS_UNAVAILABLE"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "SERVER_BUSY"
  | "SERVER_DOWN"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "UNKNOWN_ERROR";

export class ViesServiceError extends Error {
  public readonly details?: string;

  constructor(
    message: string,
    public readonly code: ViesErrorCode,
    public readonly statusCode: number = 502,
    details?: string
  ) {
    super(message);
    this.name = "ViesServiceError";
    this.details = details;
  }
}

/** User-friendly messages for each VIES error code. */
const VIES_ERROR_MESSAGES: Record<ViesErrorCode, string> = {
  INVALID_INPUT:
    "The VAT number or country code was rejected by the EU VIES system. Please check the format and try again.",
  MS_UNAVAILABLE:
    "The member state's validation service is temporarily unavailable. Please try again later.",
  SERVICE_UNAVAILABLE:
    "The EU VIES service is temporarily unavailable. Please try again later.",
  SERVER_DOWN:
    "The EU VIES service is currently down. Please try again later.",
  TIMEOUT:
    "The request to the EU VIES service timed out. Please try again.",
  SERVER_BUSY:
    "The EU VIES service is currently busy. Please try again in a few minutes.",
  NETWORK_ERROR:
    "Unable to reach the EU VIES service. Check your network connection or try again later.",
  PARSE_ERROR:
    "The EU VIES service returned an unexpected response. Please try again later.",
  UNKNOWN_ERROR:
    "An unexpected error occurred while validating the VAT number. Please try again.",
};

function toFriendlyError(
  code: ViesErrorCode,
  statusCode: number,
  rawFault?: string
): ViesServiceError {
  const message = VIES_ERROR_MESSAGES[code];
  return new ViesServiceError(message, code, statusCode, rawFault);
}

function normalizeFault(faultString: string): { code: ViesErrorCode; statusCode: number } {
  const lower = faultString.toLowerCase();
  if (lower.includes("service unavailable") || lower.includes("server down")) {
    return { code: "SERVICE_UNAVAILABLE", statusCode: 503 };
  }
  if (lower.includes("ms unavailable") || lower.includes("member state")) {
    return { code: "MS_UNAVAILABLE", statusCode: 503 };
  }
  if (lower.includes("invalid") || lower.includes("invalid input")) {
    return { code: "INVALID_INPUT", statusCode: 400 };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "TIMEOUT", statusCode: 504 };
  }
  if (lower.includes("busy") || lower.includes("overloaded")) {
    return { code: "SERVER_BUSY", statusCode: 503 };
  }
  return { code: "UNKNOWN_ERROR", statusCode: 502 };
}

function isNetworkErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  const networkCodes = [
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "ENETUNREACH",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ERR_NETWORK",
    "ERR_CONNECTION_REFUSED",
    "ERR_CONNECTION_RESET",
  ];
  return networkCodes.includes(code);
}

/**
 * Calls the EU VIES SOAP service to validate a VAT number.
 * @throws {ViesServiceError} when VIES returns a fault or the response is invalid.
 */
export async function checkVat(countryCode: string, vatNumber: string): Promise<ViesResponse> {
  const envelope = buildSoapEnvelope(countryCode, vatNumber);

  let data: string;
  try {
    const response = await axios.post<string>(VIES_URL, envelope, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        Accept: "text/xml, application/soap+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; VATValidator/1.0; +https://github.com/vat-validator-api)",
        SOAPAction: "",
      },
      responseType: "text",
      timeout: 15000,
    });
    data = response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<unknown>;
      if (ax.response?.data && typeof ax.response.data === "string") {
        const fault = getSoapFaultString(ax.response.data);
        if (fault) {
          const { code, statusCode } = normalizeFault(fault);
          throw toFriendlyError(code, statusCode, fault);
        }
      }
      if (ax.code === "ECONNABORTED" || ax.message?.toLowerCase().includes("timeout")) {
        throw toFriendlyError("TIMEOUT", 504);
      }
      if (ax.response?.status === 503) {
        throw toFriendlyError("SERVICE_UNAVAILABLE", 503);
      }
      if (ax.response?.status === 403) {
        throw toFriendlyError(
          "SERVICE_UNAVAILABLE",
          502,
          "The EU VIES service blocked the request (often when called from cloud/datacenter IPs). Try again later or run the API from a different network."
        );
      }
      if (isNetworkErrorCode(ax.code)) {
        throw toFriendlyError("NETWORK_ERROR", 502, ax.message ?? ax.code);
      }
      const statusCode = ax.response?.status && ax.response.status >= 400 ? ax.response.status : 502;
      throw toFriendlyError("UNKNOWN_ERROR", statusCode, ax.message ?? undefined);
    }
    throw toFriendlyError(
      "UNKNOWN_ERROR",
      502,
      err instanceof Error ? err.message : undefined
    );
  }

  if (typeof data !== "string" || data.trim().length === 0) {
    throw toFriendlyError("PARSE_ERROR", 502, "Empty response from VIES");
  }

  const fault = getSoapFaultString(data);
  if (fault) {
    const { code, statusCode } = normalizeFault(fault);
    throw toFriendlyError(code, statusCode, fault);
  }

  try {
    return parseViesResponse(data);
  } catch (parseErr) {
    const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw toFriendlyError("PARSE_ERROR", 502, detail);
  }
}
