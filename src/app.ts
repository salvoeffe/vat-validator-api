import express, { Request, Response } from "express";
import { sendError } from "./errors";
import type { ApiErrorCode } from "./errors";
import { optionalApiKeyMiddleware } from "./middleware/apiKey";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { checkVat, ViesServiceError } from "./services/viesService";
import type { VatValidationApiResponse } from "./types";
import { validateFullVatInput, validatePathParams } from "./validation/vatValidation";

export const app = express();

const startedAt = Date.now();

app.use(optionalApiKeyMiddleware);
app.use(apiRateLimiter);

function toApiResponse(vies: {
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  name: string;
  address: string;
  requestDate: string;
  consultationNumber?: string | null;
}): VatValidationApiResponse {
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
 * GET /health – API status for monitoring and load balancers.
 */
app.get("/health", (_req: Request, res: Response): void => {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSeconds,
    service: "vat-validator-api",
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
    const result = await checkVat(countryCode, vatNumber);
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
    const result = await checkVat(countryCode, vatNumber);
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

/** Health check for Vercel / monitoring. */
app.get("/", (_req: Request, res: Response): void => {
  res.json({
    name: "VAT Validator API",
    version: "1.0.0",
    endpoints: {
      "GET /health": "API health status",
      "GET /validate/:countryCode/:vatNumber": "Validate by path params",
      "GET /v1/validate?vat_number=XX123": "Validate by query (full VAT id)",
    },
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
