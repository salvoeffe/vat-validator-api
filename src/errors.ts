import type { Response } from "express";

/**
 * Standard API error body returned for all error responses.
 * Ensures consistent shape and appropriate HTTP status codes.
 */
export interface ApiErrorBody {
  /** Machine-readable error code for client handling */
  error: string;
  /** Human-readable message describing what went wrong */
  message: string;
  /** HTTP status code (included in body for convenience) */
  status_code: number;
  /** Optional extra detail (e.g. raw VIES fault, validation field) */
  details?: string;
}

/** Error codes returned by the API */
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SERVICE_UNAVAILABLE"
  | "MS_UNAVAILABLE"
  | "TIMEOUT"
  | "SERVER_BUSY"
  | "SERVER_DOWN"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "BAD_GATEWAY"
  | "UNKNOWN_ERROR"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR";

/**
 * Sends a JSON error response with a consistent structure and appropriate status code.
 */
export function sendError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: string
): void {
  res.status(statusCode).json({
    error: code,
    message,
    status_code: statusCode,
    ...(details && { details }),
  } satisfies ApiErrorBody);
}
