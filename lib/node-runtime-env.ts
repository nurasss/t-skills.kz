// Node.js runtime environment for VPS deployments.
//
// Cloudflare Workers expose bindings through `import { env } from
// "cloudflare:workers"`. That module does not exist on plain Node, so the VPS
// vite target aliases `cloudflare:workers` to this file (see vite.config.ts).
// Same approach as lib/vercel-runtime-env.ts, plus durable backends:
//
// `process.env` carries configuration, while the `DB`/`BUCKET` bindings that
// only exist on Cloudflare are served from the Node adapters
// (./node-store-node: SQLite file + local directory). Application code keeps
// reading `getRuntimeEnv().DB` / `.BUCKET` unchanged on both targets.
//
// NOTE: never set literal `DB`/`BUCKET` environment variables; those names
// are reserved for the bindings above.
import { nodeBucket, nodeDatabase } from "./node-store-node";

const base = process.env as Record<string, string | undefined>;

export const env = new Proxy(base, {
  get(target, property, receiver) {
    if (property === "DB") return target.DB ?? nodeDatabase();
    if (property === "BUCKET") return target.BUCKET ?? nodeBucket();
    return Reflect.get(target, property, receiver);
  },
});
