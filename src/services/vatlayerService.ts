import axios, { AxiosError } from "axios";
import type { ViesResponse } from "../types";

const VATLAYER_URL = "https://apilayer.net/api/validate";

/**
 * Vatlayer API response shape (see https://vatlayer.com/documentation).
 */
interface VatlayerResponse {
  valid?: boolean;
  format_valid?: boolean;
  query?: string;
  country_code?: string;
  vat_number?: string;
  company_name?: string;
  company_address?: string;
  database?: string;
}

/**
 * Validates a VAT number using the Vatlayer API (apilayer.net).
 * Use as fallback when VIES blocks your server IP (e.g. on Vercel).
 * Returns the same ViesResponse shape so the rest of the app stays unchanged.
 *
 * @see https://wpfactory.com/docs/order-min-max/troubleshooting/vies-ip-blocking/
 * @see https://vatlayer.com/documentation
 */
export async function checkVatViaVatlayer(
  apiKey: string,
  countryCode: string,
  vatNumber: string
): Promise<ViesResponse> {
  const fullVat = `${countryCode}${vatNumber}`.replace(/\s/g, "");

  let data: VatlayerResponse;
  try {
    const response = await axios.get<VatlayerResponse>(VATLAYER_URL, {
      params: {
        access_key: apiKey,
        vat_number: fullVat,
      },
      timeout: 10000,
    });
    data = response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ error?: { info?: string } }>;
      const info = ax.response?.data?.error?.info ?? ax.message;
      throw new Error(`Vatlayer request failed: ${info}`);
    }
    throw new Error(err instanceof Error ? err.message : "Vatlayer request failed");
  }

  if (!data || typeof data.valid !== "boolean") {
    throw new Error("Vatlayer returned an invalid response");
  }

  const requestDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    valid: data.valid,
    countryCode: data.country_code ?? countryCode,
    vatNumber: data.vat_number ?? vatNumber,
    name: data.company_name ?? "",
    address: data.company_address ?? "",
    requestDate,
    consultationNumber: null,
  };
}
