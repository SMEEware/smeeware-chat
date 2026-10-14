import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./test-loader.mjs";

const { POST } = loadTypeScript(new URL("../../app/api/chat/route.ts", import.meta.url));

test("chat proxy leaves default token budget to backend and forwards explicit budgets", async () => {
  const originalFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    for (const max_tokens of [undefined, 393216, 1200]) {
      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }], model: "deepseek-v4-flash", max_tokens }),
      });
      request.cookies = { get: () => undefined };
      const response = await POST(request);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "data: [DONE]\n\n");
      assert.equal(captured.at(-1).max_tokens, max_tokens);
    }
    assert.equal(Object.hasOwn(captured[0], "max_tokens"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
