import type { HighlighterCore } from "shiki/core";

/**
 * Shiki bringt die Grammatiken und Themes von VS Code mit. Geladen wird
 * es erst, wenn wirklich ein Codeblock auf der Seite steht -- die
 * dynamischen Importe unten trennt der Bundler in eigene Chunks.
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;

/** Zaun-Angabe -> Grammatik. Alles Unbekannte faellt auf Klartext zurueck. */
const aliases: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  rs: "rust",
  rust: "rust",
  sql: "sql",
  html: "html",
  css: "css",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  diff: "diff",
  patch: "diff",
};

function loadHighlighter() {
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ]);

    return createHighlighterCore({
      themes: [
        import("shiki/themes/github-light-default.mjs"),
        import("shiki/themes/github-dark-default.mjs"),
      ],
      langs: [
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/jsx.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/go.mjs"),
        import("shiki/langs/rust.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/langs/markdown.mjs"),
        import("shiki/langs/diff.mjs"),
      ],
      // Die JavaScript-Engine spart den WASM-Nachladevorgang. Fuer die
      // Grammatiken hier reicht sie aus.
      engine: createJavaScriptRegexEngine(),
    });
  })();

  return highlighterPromise;
}

/**
 * Faerbt Code ein und liefert fertiges HTML. Shiki maskiert den Inhalt
 * dabei selbst -- deshalb darf das Ergebnis eingesetzt werden, auch wenn
 * der Code aus einer Modellantwort stammt.
 */
export async function highlight(code: string, language?: string) {
  const highlighter = await loadHighlighter();
  const lang = aliases[language?.toLowerCase() ?? ""] ?? "text";

  return highlighter.codeToHtml(code, {
    lang,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    // Ohne Standardfarbe schreibt Shiki beide Themes als CSS-Variablen
    // heraus -- das Umschalten macht dann die Klasse .dark, ohne dass
    // hier irgendetwas neu berechnet werden muss.
    defaultColor: false,
  });
}
