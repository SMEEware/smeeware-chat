export type PluginBefehl = {
  aktion: "install" | "deactivate";
  slug: string;
};

const MUSTER = /^\/(install|deactivate)\s+(\S+)\s*$/i;

export function alsPluginBefehl(eingabe: string): PluginBefehl | null {
  const treffer = MUSTER.exec(eingabe.trim());
  if (!treffer) return null;
  return {
    aktion: treffer[1].toLowerCase() as "install" | "deactivate",
    slug: treffer[2].toLowerCase(),
  };
}

export function istPluginPraefix(eingabe: string): boolean {
  return /^\/(install|deactivate)\b/i.test(eingabe.trim());
}
