import rateLimit from "express-rate-limit";
import { config } from "../config";
import { sendError } from "../errors";

/**
 * Rate limiter to prevent abuse. Applied to validation endpoints.
 * Skips /health and / so monitoring and discovery are not limited.
 * Limits are configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX.
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path === "/",
  handler: (req, res) => {
    sendError(
      res,
      429,
      "TOO_MANY_REQUESTS",
      `Rate limit exceeded. Maximum ${config.rateLimitMax} requests per ${config.rateLimitWindowMs / 60000} minutes. Try again later.`
    );
  },
});
