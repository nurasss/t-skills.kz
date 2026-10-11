// Registered via `node --import` BEFORE the test entrypoint so the resolve
// hooks in ./cf-hooks.mjs apply to every import in the test process.
import { register } from "node:module";

register("./cf-hooks.mjs", import.meta.url);
