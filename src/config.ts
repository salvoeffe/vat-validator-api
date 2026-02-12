/**
 * Configuration from environment variables.
 * Set these in Vercel Dashboard (Project → Settings → Environment Variables)
 * or in a .env file for local development.
 */

function envInt(key: string, defaultValue: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

export const config = {
  /** Server port (Vercel sets PORT automatically). */
  port: envInt("PORT", 3000),

  /** Rate limit: time window in milliseconds. Default 15 minutes. */
  rateLimitWindowMs: envInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),

  /** Rate limit: max requests per window per IP. */
  rateLimitMax: envInt("RATE_LIMIT_MAX", 100),

  /**
   * Optional API key. If set, requests must include X-API-Key header (or Authorization: Bearer <key>).
   * Leave unset for open access (e.g. add later for RapidAPI).
   */
  apiKey: process.env.API_KEY?.trim() || null,

  /** Node environment. */
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
