# Cloudflare closed-beta setup

The repository uses one Worker artifact with two Wrangler environments. Never deploy the root environment.

| Environment | Worker | D1 | R2 | Access | Payments | AI |
|---|---|---|---|---|---|---|
| staging | `orbita-30-staging` | `orbita30-staging` | `orbita30-staging` | required | off | off |
| production | `orbita-30-production` | `orbita30-production` | `orbita30-production` | required | off | off |

Bindings stay `DB` and `BUCKET`; IDs and buckets must differ. R2 public access stays disabled. Apply migrations per environment before deployment:

```sh
npm ci
npm run build
npm run deploy:config-check
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler deploy --env staging
```

Production uses the same commands with `--env production`, only from the manual GitHub workflow on `main`. `RETENTION_DRY_RUN=true` remains set until a reviewed staging retention drill passes.

Required Worker secret in each environment: `PDF_SIGNING_SECRET`. Stripe and OpenAI secrets are intentionally absent in closed beta.

Required GitHub environment configuration:

- repository secret `CLOUDFLARE_ACCOUNT_ID`;
- staging secret `CLOUDFLARE_API_TOKEN_STAGING`;
- production secret `CLOUDFLARE_API_TOKEN_PRODUCTION`;
- matching Access service-token client ID/secret pairs;
- `STAGING_URL` and `PRODUCTION_URL` environment variables.

Never print or commit token values. Use least-privilege tokens restricted to the matching Worker and storage resources where Cloudflare supports resource scoping.
