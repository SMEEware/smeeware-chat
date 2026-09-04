import type { Attachment } from "@/lib/chat/types";

export const TEXT_MAX_CHARS = 12_000;

export const TEXT_TOTAL_BUDGET = 24_000;

export const MAX_ATTACHMENTS = 8;

export const IMAGE_MAX_BYTES = 20_000_000;

const BILD_TYP = /^image\/(png|jpeg|webp|gif)$/i;

const TEXT_TYP =
  /^text\/|^application\/(json|xml|javascript|x-yaml|x-sh|toml|sql)|\+json$|\+xml$/i;

const TEXT_ENDUNG =
  /\.(txt|md|markdown|mdx|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|scss|less|jsx?|tsx?|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|sql|ini|cfg|conf|log|gitignore|dockerfile)$/i;

export const DATEI_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/*",
  ".md,.markdown,.mdx,.csv,.tsv,.json,.jsonl,.yml,.yaml,.toml,.xml",
  ".js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php",
  ".sh,.zsh,.bash,.sql,.ini,.cfg,.conf,.log,.css,.scss,.html",
].join(",");

export type Sorte = Attachment["kind"];

export function einordnen(datei: File): Sorte | null {
  const typ = (datei.type || "").split(";")[0].trim().toLowerCase();
  if (BILD_TYP.test(typ)) return "image";
  if (TEXT_TYP.test(typ) || TEXT_ENDUNG.test(datei.name)) return "text";
  return null;
}

export function groesse(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function textLesen(datei: File): Promise<Attachment> {
  const roh = await datei.text();
  const gekuerzt = roh.length > TEXT_MAX_CHARS;

  return {
    id: neueId(),
    name: datei.name,
    mediaType: datei.type || "text/plain",
    bytes: datei.size,
    kind: "text",
    text: gekuerzt ? roh.slice(0, TEXT_MAX_CHARS) : roh,
    truncated: gekuerzt || undefined,
  };
}

export async function bilderHochladen(
  dateien: File[],
  signal?: AbortSignal,
): Promise<Attachment[]> {
  const form = new FormData();
  for (const datei of dateien) form.append("files", datei, datei.name);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form,
    signal,
  });

  if (!response.ok) {
    let meldung = `HTTP ${response.status}`;
    try {
      const nutzlast = await response.json();
      meldung = nutzlast?.error?.message ?? meldung;
    } catch {
    }
    throw new Error(meldung);
  }

  const nutzlast = (await response.json()) as {
    files: {
      id: string;
      filename: string;
      media_type: string;
      bytes: number;
      path: string;
    }[];
  };

  return (nutzlast.files ?? []).map((datei) => ({
    id: datei.id,
    name: datei.filename,
    mediaType: datei.media_type,
    bytes: datei.bytes,
    kind: "image" as const,
    path: datei.path,
  }));
}

export function vorschauUrl(anhang: Attachment): string | null {
  return anhang.kind === "image" ? `/api/uploads/${anhang.id}` : null;
}

export function anhangBlock(anhaenge: Attachment[]): string {
  if (anhaenge.length === 0) return "";

  const teile: string[] = [];
  let verbraucht = 0;

  for (const anhang of anhaenge) {
    const kopf = `${anhang.name} (${anhang.mediaType}, ${groesse(anhang.bytes)})`;

    if (anhang.kind === "image") {
      teile.push(
        `[attached image] ${kopf}\n` +
          `Path on this machine: ${anhang.path}\n` +
          `Use analyze_image with that path to look at what is in it. ` +
          `To make a NEW picture from it -- same style, combined with ` +
          `another, changed in some way -- pass that path to ` +
          `generate_image as reference_images instead.`,
      );
      continue;
    }

    const rest = Math.max(0, TEXT_TOTAL_BUDGET - verbraucht);
    const roh = anhang.text ?? "";
    const inhalt = roh.slice(0, rest);
    verbraucht += inhalt.length;

    const beschnitten = anhang.truncated || inhalt.length < roh.length;
    teile.push(
      `[attached file] ${kopf}${beschnitten ? " -- truncated" : ""}\n` +
        `--- begin ${anhang.name} ---\n${inhalt}\n--- end ${anhang.name} ---`,
    );
  }

  return teile.join("\n\n");
}
