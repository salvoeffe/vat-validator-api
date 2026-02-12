# Vercel deployment

## How it works

- **`api/index.ts`** exports the Express app as the serverless function handler.
- **`vercel.json`** sends all routes to that function so `/`, `/health`, `/validate/...`, and `/v1/validate` work on one deployment.

## Deploy

1. Push to GitHub and [import the project in Vercel](https://vercel.com/new), or run `vercel` in the repo root.
2. Set environment variables in **Project → Settings → Environment Variables** (optional).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Set by Vercel automatically. | — |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds. | `900000` (15 min) |
| `RATE_LIMIT_MAX` | Max requests per window per IP. | `100` |
| `API_KEY` | If set, validation endpoints require `X-API-Key` or `Authorization: Bearer <key>`. `/` and `/health` stay open. | not set |
| `NODE_ENV` | `development` or `production`. | `development` |

Copy `.env.example` to `.env` for local development; Vercel uses the dashboard (or CLI) for production.
