import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { sendError } from "../errors";

/**
 * Optional API key middleware. When API_KEY env var is set, requires requests
 * to include the key via X-API-Key header or Authorization: Bearer <key>.
 * When API_KEY is not set, all requests pass through.
 * Skips /health and / so monitoring and docs remain accessible.
 */
export function optionalApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.apiKey) {
    next();
    return;
  }
  if (req.path === "/health" || req.path === "/") {
    next();
    return;
  }
  const headerKey = req.get("X-API-Key");
  const bearer = req.get("Authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
  const provided = headerKey?.trim() || token;
  if (provided === config.apiKey) {
    next();
    return;
  }
  if (!provided) {
    sendError(res, 401, "UNAUTHORIZED", "API key required. Provide X-API-Key header or Authorization: Bearer <key>.");
    return;
  }
  sendError(res, 403, "FORBIDDEN", "Invalid API key.");
}
