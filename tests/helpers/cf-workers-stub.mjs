// Test-only stand-in for the Cloudflare runtime env (`cloudflare:workers`).
// Tests assign bindings (e.g. `env.DB = d1Shim`) before exercising lib code.
// Never imported by production code.
export const env = {};
