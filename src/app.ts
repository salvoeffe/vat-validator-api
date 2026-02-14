// VAT Validator API – Express app and routes
import express, { Request, Response } from "express";
import { config } from "./config";
import { sendError } from "./errors";
import type { ApiErrorCode } from "./errors";
import { optionalApiKeyMiddleware } from "./middleware/apiKey";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { checkVatViaVatlayer } from "./services/vatlayerService";
import { checkVat, ViesServiceError } from "./services/viesService";
import type { VatValidationApiResponse } from "./types";
import type { ViesResponse } from "./types";
import { validateFullVatInput, validatePathParams } from "./validation/vatValidation";

export const app = express();

const startedAt = Date.now();

app.use(optionalApiKeyMiddleware);
app.use(apiRateLimiter);

function toApiResponse(vies: ViesResponse): VatValidationApiResponse {
  const checkedAt = new Date().toISOString();
  return {
    valid: vies.valid,
    country_code: vies.countryCode,
    vat_number: vies.vatNumber,
    company_name: vies.name || null,
    address: vies.address || null,
    consultation_number: vies.consultationNumber ?? null,
    request_date: vies.requestDate || null,
    checked_at: checkedAt,
  };
}

/**
 * Try VIES first; if VIES blocks the request (403 / SERVICE_UNAVAILABLE) and VATLAYER_API_KEY is set,
 * fall back to Vatlayer so validation works from cloud IPs (e.g. Vercel).
 * @see https://wpfactory.com/docs/order-min-max/troubleshooting/vies-ip-blocking/
 */
async function validateVat(countryCode: string, vatNumber: string): Promise<ViesResponse> {
  try {
    return await checkVat(countryCode, vatNumber);
  } catch (err) {
    const useVatlayer =
      config.vatlayerApiKey &&
      err instanceof ViesServiceError &&
      err.code === "SERVICE_UNAVAILABLE" &&
      err.statusCode === 502;
    if (useVatlayer) {
      return await checkVatViaVatlayer(config.vatlayerApiKey!, countryCode, vatNumber);
    }
    throw err;
  }
}

/**
 * GET /health – API status for monitoring and load balancers.
 */
app.get("/health", (_req: Request, res: Response): void => {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSeconds,
    service: "vat-validator-api",
    vatlayer_configured: Boolean(config.vatlayerApiKey),
  });
});

/**
 * GET /validate/:countryCode/:vatNumber
 * e.g. /validate/IE/6388047V
 */
app.get("/validate/:countryCode/:vatNumber", async (req: Request, res: Response): Promise<void> => {
  const validation = validatePathParams(
    req.params.countryCode ?? "",
    req.params.vatNumber ?? ""
  );

  if (!validation.valid) {
    sendError(res, 400, "INVALID_INPUT", validation.message);
    return;
  }

  const { countryCode, vatNumber } = validation;

  try {
    const result = await validateVat(countryCode, vatNumber);
    res.json(toApiResponse(result));
  } catch (err) {
    if (err instanceof ViesServiceError) {
      sendError(
        res,
        err.statusCode,
        err.code as ApiErrorCode,
        err.message,
        err.details
      );
      return;
    }
    sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "An unexpected error occurred. Please try again.",
      err instanceof Error ? err.message : undefined
    );
  }
});

/**
 * GET /v1/validate?vat_number=IE6388047V
 * Accepts full VAT identifier; country code is first 2 characters.
 */
app.get("/v1/validate", async (req: Request, res: Response): Promise<void> => {
  const raw = (req.query.vat_number as string) ?? "";
  const validation = validateFullVatInput(raw);

  if (!validation.valid) {
    sendError(res, 400, "INVALID_INPUT", validation.message);
    return;
  }

  const { countryCode, vatNumber } = validation;

  try {
    const result = await validateVat(countryCode, vatNumber);
    res.json(toApiResponse(result));
  } catch (err) {
    if (err instanceof ViesServiceError) {
      sendError(
        res,
        err.statusCode,
        err.code as ApiErrorCode,
        err.message,
        err.details
      );
      return;
    }
    sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "An unexpected error occurred. Please try again.",
      err instanceof Error ? err.message : undefined
    );
  }
});

/** Root: welcome message and API documentation. */
app.get("/", (_req: Request, res: Response): void => {
  res.json({
    message: "Welcome to the VAT Validator API",
    description:
      "Validate EU VAT numbers via the official EU VIES system. When VIES blocks cloud IPs (e.g. on Vercel), falls back to Vatlayer if VATLAYER_API_KEY is set. Returns company name, address, and validation status in a clean JSON format.",
    version: "1.0.0",
    documentation: {
      base_url: "Use this API's base URL as the prefix for all endpoints below.",
      authentication:
        "Optional: set API_KEY in the server environment to require X-API-Key or Authorization: Bearer <key> for validation endpoints. / and /health remain public.",
      rate_limits: "Applied per IP (configurable via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS). / and /health are not rate limited.",
      vatlayer_fallback:
        "If VIES blocks your server (e.g. 403 on Vercel), set VATLAYER_API_KEY (apilayer.net) for automatic fallback. Free tier: 100 checks/month.",
    },
    endpoints: [
      {
        method: "GET",
        path: "/",
        description: "This welcome and API documentation.",
      },
      {
        method: "GET",
        path: "/health",
        description: "Health check. Returns status, timestamp, and uptime. For monitoring and load balancers.",
      },
      {
        method: "GET",
        path: "/validate/:countryCode/:vatNumber",
        description: "Validate a VAT number using path parameters.",
        example: "/validate/IE/6388047V",
        parameters: {
          countryCode: "Two-letter EU country code (e.g. IE, DE, FR).",
          vatNumber: "VAT number without country prefix (spaces/dashes optional).",
        },
      },
      {
        method: "GET",
        path: "/v1/validate",
        description: "Validate a VAT number using query parameter (full identifier).",
        example: "/v1/validate?vat_number=IE6388047V",
        parameters: {
          vat_number: "Full VAT id: two-letter country code + number (e.g. IE6388047V).",
        },
      },
    ],
  });
});

/** 404: unknown routes get a consistent error response. */
app.use((_req: Request, res: Response) => {
  sendError(res, 404, "NOT_FOUND", "The requested endpoint was not found.");
});

/** Global error handler: uncaught errors and next(err) get a consistent JSON error response. */
app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction): void => {
  if (res.headersSent) {
    _next(err);
    return;
  }
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.", message);
});
