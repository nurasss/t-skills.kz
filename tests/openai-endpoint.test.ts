import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveOpenAIBaseUrl } from "@/lib/openai-endpoint";

test("OpenAI endpoint resolution allows only the official HTTPS origin", () => {
  assert.equal(resolveOpenAIBaseUrl(), "https://api.openai.com");
  assert.equal(resolveOpenAIBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com");
  assert.equal(resolveOpenAIBaseUrl("http://api.openai.com"), null);
  assert.equal(resolveOpenAIBaseUrl("https://evil.example/v1"), null);
  assert.equal(resolveOpenAIBaseUrl("https://api.openai.com.evil.example"), null);
  assert.equal(resolveOpenAIBaseUrl("https://user:password@api.openai.com"), null);
  assert.equal(resolveOpenAIBaseUrl("https://api.openai.com/proxy"), null);
});
