import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypeScript } from "./test-loader.mjs";

const { CodeBlock } = loadTypeScript(new URL("../../components/code-block.tsx", import.meta.url));
const longCode = Array.from({ length: 80 }, (_, line) => `const value${line} = ${line};`).join("\n");
const render = (props) => renderToStaticMarkup(React.createElement(CodeBlock, props));

// The sticky header keeps the single copy action available without duplicating it below.
test("long chat code exposes one header copy control before the complete code", () => {
  const html = render({ code: longCode, language: "typescript", variant: "chat" });
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.ok(html.indexOf("<button") < html.indexOf("value0"));
  assert.ok(html.includes("value79"));
});

// Concise snippets and documentation examples also keep one copy control.
test("short chat snippets and documentation examples keep one copy control", () => {
  for (const props of [{ code: "const x = 1;", variant: "chat" }, { code: longCode }]) {
    const html = render(props);
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  }
});
