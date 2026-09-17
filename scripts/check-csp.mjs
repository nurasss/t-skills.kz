import { readFileSync } from "node:fs";

const source = readFileSync("lib/security-headers.ts", "utf8");
const requiredDirectives = ["default-src", "base-uri", "object-src", "frame-ancestors", "form-action", "script-src", "style-src", "img-src", "font-src", "connect-src"];
const csp = source.match(/return \[(.*?)\]\.join\("; "\)/s)?.[1] ?? "";
const missing = requiredDirectives.filter((directive) => !csp.includes(directive));
const unsafe = ["'unsafe-eval'", "script-src *", "connect-src *", "img-src *"].filter((pattern) => csp.includes(pattern));
if (missing.length || unsafe.length) {
  console.error(`CSP_CHECK_FAILED missing=${missing.join(",")} unsafe=${unsafe.join(",")}`);
  process.exit(1);
}
console.log("CSP_CHECK=PASS no_unsafe_script_or_wildcard_network_sources=YES");
