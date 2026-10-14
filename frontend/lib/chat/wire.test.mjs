import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const source = new URL("./wire.ts", import.meta.url);
let toWire;
if (existsSync(source)) {
  const { loadTypeScript } = await import("./test-loader.mjs");
  ({ toWire } = loadTypeScript(source));
}

const file = (id, name = "project.zip") => ({
  id, name, mediaType: "application/zip", bytes: 123, kind: "file",
});

test("uploaded originals travel as references alongside the actual user task", () => {
  assert.equal(typeof toWire, "function");
  const messages = toWire([
    { id: "question", role: "user", content: "Unpack and edit main.py", attachments: [file("a".repeat(32))] },
  ]);
  assert.deepEqual(messages, [{ role: "user", content: "Unpack and edit main.py", attachment_ids: ["a".repeat(32)] }]);
});

test("consecutive questions retain their own attachment limits", () => {
  assert.equal(typeof toWire, "function");
  const first = Array.from({ length: 8 }, (_, index) => file(String(index + 1).repeat(32)));
  const second = [file("b".repeat(32))];
  const messages = toWire([
    { id: "one", role: "user", content: "First request", attachments: first },
    { id: "two", role: "user", content: "Follow-up", attachments: second },
  ]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].attachment_ids.length, 8);
  assert.deepEqual(messages[1].attachment_ids, ["b".repeat(32)]);
});

test("legacy inline text still reaches the model and hidden references do not", () => {
  assert.equal(typeof toWire, "function");
  const messages = toWire([
    { id: "hidden", role: "user", content: "hidden", hidden: true, attachments: [file("a".repeat(32))] },
    { id: "old", role: "user", content: "Read", attachments: [{ id: "old-id", kind: "text", name: "old.txt", mediaType: "text/plain", bytes: 5, text: "hello" }] },
    { id: "answer", role: "assistant", content: "[Download result](/api/uploads/" + "b".repeat(32) + ")" },
  ]);
  assert.equal(messages.length, 2);
  assert.ok(messages[0].content.includes("hello"));
  assert.ok(!messages[0].attachment_ids);
  assert.equal(messages[1].content, "[Download result](/api/uploads/" + "b".repeat(32) + ")");
});
