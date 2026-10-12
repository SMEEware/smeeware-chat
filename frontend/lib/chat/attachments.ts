import type { Attachment } from "@/lib/chat/types";

export const TEXT_MAX_CHARS = 12_000;

export const TEXT_TOTAL_BUDGET = 24_000;

export const MAX_ATTACHMENTS = 8;

export const IMAGE_MAX_BYTES = 20_000_000;

const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/i;

const TEXT_TYPE =
  /^text\/|^application\/(json|xml|javascript|x-yaml|x-sh|toml|sql)|\+json$|\+xml$/i;

const TEXT_EXTENSION =
  /\.(txt|md|markdown|mdx|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|scss|less|jsx?|tsx?|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|sql|ini|cfg|conf|log|gitignore|dockerfile)$/i;

export const TEXT_FILE_ACCEPT = [
  "text/*",
  ".md,.markdown,.mdx,.csv,.tsv,.json,.jsonl,.yml,.yaml,.toml,.xml",
  ".js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php",
  ".sh,.zsh,.bash,.sql,.ini,.cfg,.conf,.log,.css,.scss,.html",
].join(",");

export const FILE_ACCEPT = [
  "image/png,image/jpeg,image/webp,image/gif",
  TEXT_FILE_ACCEPT,
].join(",");

export type AttachmentKind = Attachment["kind"];

export function classify(file: File): AttachmentKind | null {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (IMAGE_TYPE.test(type)) return "image";
  if (TEXT_TYPE.test(type) || TEXT_EXTENSION.test(file.name)) return "text";
  return null;
}

export function size(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function readTextFile(file: File): Promise<Attachment> {
  const raw = await file.text();
  const truncated = raw.length > TEXT_MAX_CHARS;

  return {
    id: newId(),
    name: file.name,
    mediaType: file.type || "text/plain",
    bytes: file.size,
    kind: "text",
    text: truncated ? raw.slice(0, TEXT_MAX_CHARS) : raw,
    truncated: truncated || undefined,
  };
}

export async function uploadImages(
  files: File[],
  signal?: AbortSignal,
): Promise<Attachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form,
    signal,
  });

  if (!response.ok) {
    let statusMessage = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      statusMessage = payload?.error?.message ?? statusMessage;
    } catch {
    }
    throw new Error(statusMessage);
  }

  const payload = (await response.json()) as {
    files: {
      id: string;
      filename: string;
      media_type: string;
      bytes: number;
      path: string;
    }[];
  };

  return (payload.files ?? []).map((file) => ({
    id: file.id,
    name: file.filename,
    mediaType: file.media_type,
    bytes: file.bytes,
    kind: "image" as const,
    path: file.path,
  }));
}

export function previewUrl(attachment: Attachment): string | null {
  return attachment.kind === "image" ? `/api/uploads/${attachment.id}` : null;
}

export function attachmentBlock(attachmentList: Attachment[]): string {
  if (attachmentList.length === 0) return "";

  const parts: string[] = [];
  let used = 0;

  for (const attachment of attachmentList) {
    const head = `${attachment.name} (${attachment.mediaType}, ${size(attachment.bytes)})`;

    if (attachment.kind === "image") {
      parts.push(
        `[attached image] ${head}\n` +
          `Path on this machine: ${attachment.path}\n` +
          `Use analyze_image with that path to look at what is in it. ` +
          `To make a NEW picture from it -- same style, combined with ` +
          `another, changed in some way -- pass that path to ` +
          `generate_image as reference_images instead.`,
      );
      continue;
    }

    const rest = Math.max(0, TEXT_TOTAL_BUDGET - used);
    const raw = attachment.text ?? "";
    const content = raw.slice(0, rest);
    used += content.length;

    const clipped = attachment.truncated || content.length < raw.length;
    parts.push(
      `[attached file] ${head}${clipped ? " -- truncated" : ""}\n` +
        `--- begin ${attachment.name} ---\n${content}\n--- end ${attachment.name} ---`,
    );
  }

  return parts.join("\n\n");
}
