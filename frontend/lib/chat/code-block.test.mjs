import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypeScript } from "./test-loader.mjs";

const { CodeBlock } = loadTypeScript(new URL("../../components/code-block.tsx", import.meta.url));
const longCode = Array.from({ length: 80 }, (_, line) => `const value${line} = ${line};`).join("\n");
const render = (props) => renderToStaticMarkup(React.createElement(CodeBlock, props));

// Losing the second action would again force readers at the code's end back to its header.
test("long chat code exposes copy controls before and after the complete code", () => {
  const html = render({ code: longCode, language: "typescript", variant: "chat" });
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.ok(html.indexOf("<button") < html.indexOf("value0"));
  assert.ok(html.lastIndexOf("<button") > html.indexOf("value79"));
  assert.match(html, /80/);
});

// Keep concise snippets and documentation examples free of the extra chat footer.
test("short chat snippets and documentation examples keep one copy control", () => {
  for (const props of [{ code: "const x = 1;", variant: "chat" }, { code: longCode }]) {
    const html = render(props);
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  }
});
