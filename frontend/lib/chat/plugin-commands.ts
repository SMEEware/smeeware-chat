export type PluginCommand = {
  action: "install" | "deactivate";
  slug: string;
};

const PATTERNS = /^\/(install|deactivate)\s+(\S+)\s*$/i;

export function asPluginCommand(input: string): PluginCommand | null {
  const match = PATTERNS.exec(input.trim());
  if (!match) return null;
  return {
    action: match[1].toLowerCase() as "install" | "deactivate",
    slug: match[2].toLowerCase(),
  };
}

export function isPluginPrefix(input: string): boolean {
  return /^\/(install|deactivate)\b/i.test(input.trim());
}
