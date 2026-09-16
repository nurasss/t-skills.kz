// Vercel/Nitro has no Cloudflare `env` binding. Keep the application runtime
// contract intact by exposing Vercel's process environment through the same
// module shape used by db/index.ts. Durable D1/R2 operations still require the
// canonical Cloudflare Worker deployment and are not silently emulated here.
export const env = process.env;
