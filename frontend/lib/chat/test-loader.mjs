import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontend = fileURLToPath(new URL("../../", import.meta.url));
const cache = new Map();

// Tests execute the real helpers without requiring Node's newer TypeScript
// stripping feature or changing the application's module configuration.
export function loadTypeScript(pathOrURL) {
  const filename = pathOrURL instanceof URL ? fileURLToPath(pathOrURL) : resolve(pathOrURL);
  if (cache.has(filename)) return cache.get(filename).exports;

  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const nativeRequire = createRequire(filename);
  const require = (specifier) => {
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const base = specifier.startsWith("@/")
        ? resolve(frontend, specifier.slice(2))
        : resolve(dirname(filename), specifier);
      const target = extname(base) ? base : [`${base}.ts`, `${base}.tsx`].find(existsSync);
      if (target && /\.tsx?$/.test(target)) return loadTypeScript(target);
    }
    return nativeRequire(specifier);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  new Function("require", "module", "exports", "__filename", "__dirname", outputText)(
    require, loaded, loaded.exports, filename, dirname(filename),
  );
  return loaded.exports;
}
