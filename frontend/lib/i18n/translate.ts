export type Messages = { [key: string]: string | string[] | Messages };

export type Vars = Record<string, string | number>;

function lookup(messages: Messages, key: string): string | string[] | undefined {
  let node: string | string[] | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object" || Array.isArray(node)) {
      return undefined;
    }
    node = node[part];
  }
  return typeof node === "string" || Array.isArray(node) ? node : undefined;
}

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(messages: Messages, key: string, vars?: Vars): string {
  const value = lookup(messages, key);
  if (typeof value === "string") return fill(value, vars);
  return key;
}

export function translateList(messages: Messages, key: string): string[] {
  const value = lookup(messages, key);
  return Array.isArray(value) ? value : [];
}

export type TranslateFn = (key: string, vars?: Vars) => string;
export type TranslateListFn = (key: string) => string[];
