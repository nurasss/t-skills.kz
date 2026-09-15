import { readFile } from "node:fs/promises";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ttf?inline") && !url.endsWith(".ttf")) return nextLoad(url, context);
  const fileUrl = url.replace(/\?inline$/, "");
  const base64 = (await readFile(new URL(fileUrl))).toString("base64");
  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(`data:font/ttf;base64,${base64}`)};`,
  };
}
