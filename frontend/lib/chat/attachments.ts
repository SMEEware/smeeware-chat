import type { Attachment } from "@/lib/chat/types";
import type { TranslateFn } from "@/lib/i18n/translate";

export const TEXT_MAX_CHARS = 12_000;
export const TEXT_TOTAL_BUDGET = 24_000;
export const MAX_ATTACHMENTS = 8;
export const UPLOAD_MAX_BYTES = 20_000_000;

const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/i;
const UPLOAD_ID = /^[0-9a-f]{32}$/;

export type UploadLimits = { maxBytes: number; maxFiles: number };
type UploadDetails = { filename?: string; max_bytes?: number; max_files?: number };

export class UploadError extends Error {
  code: string;
  details: UploadDetails;

  constructor(code: string, details: UploadDetails = {}) {
    super(code);
    this.name = "UploadError";
    this.code = code;
    this.details = details;
  }
}

export function classify(file: Pick<File, "type">): "image" | "file" {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  return IMAGE_TYPE.test(type) ? "image" : "file";
}

export function size(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function prepareUploads(
  files: File[],
  limits: UploadLimits,
  attachedCount: number,
): { files: File[]; errors: UploadError[] } {
  const remaining = Math.max(0, limits.maxFiles - attachedCount);
  const accepted: File[] = [];
  const errors: UploadError[] = [];
  let tooMany = false;

  for (const file of files) {
    if (file.size > limits.maxBytes) {
      errors.push(new UploadError("file_too_large", {
        filename: file.name,
        max_bytes: limits.maxBytes,
      }));
    } else if (file.size === 0) {
      errors.push(new UploadError("empty_file", { filename: file.name }));
    } else if (accepted.length >= remaining) {
      tooMany = true;
    } else {
      accepted.push(file);
    }
  }
  if (tooMany) errors.push(new UploadError("too_many_files", { max_files: limits.maxFiles }));
  return { files: accepted, errors };
}

export function uploadErrorMessage(
  error: unknown,
  t: TranslateFn,
  limits: UploadLimits = { maxBytes: UPLOAD_MAX_BYTES, maxFiles: MAX_ATTACHMENTS },
): string {
  if (!(error instanceof UploadError)) return t("chat.composer.uploadFailed");
  const name = error.details.filename || t("chat.composer.file");
  switch (error.code) {
    case "file_too_large":
      return t("chat.composer.largerThan", {
        name,
        size: size(error.details.max_bytes ?? limits.maxBytes),
      });
    case "upload_request_too_large":
      return t("chat.composer.uploadRequestTooLarge");
    case "too_many_files":
      return t("chat.composer.atMostFiles", { max: error.details.max_files ?? limits.maxFiles });
    case "unauthorized":
      return t("chat.composer.uploadUnauthorized");
    case "empty_file":
      return t("chat.composer.emptyFile", { name });
    case "upload_unavailable":
      return t("chat.composer.uploadUnavailable");
    default:
      return t("chat.composer.uploadFailed");
  }
}

type UploadedFile = {
  id: string;
  filename: string;
  media_type: string;
  bytes: number;
  path?: string;
};

export async function uploadFiles(
  files: File[],
  signal?: AbortSignal,
): Promise<Attachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);

  let response: Response;
  try {
    response = await fetch("/api/uploads", { method: "POST", body: form, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new UploadError("upload_unavailable");
  }

  if (!response.ok) {
    let code = response.status === 413
      ? "upload_request_too_large"
      : response.status === 401 ? "unauthorized" : "upload_failed";
    let details: UploadDetails = {};
    try {
      const payload = await response.json();
      code = payload?.error?.code ?? code;
      details = payload?.error?.details ?? details;
    } catch {
      // The UI still has a localized fallback for non-JSON proxy errors.
    }
    throw new UploadError(code, details);
  }

  const payload = (await response.json()) as { files: UploadedFile[] };
  if (!Array.isArray(payload.files)) throw new UploadError("upload_failed");
  return payload.files.map((file) => ({
    id: file.id,
    name: file.filename,
    mediaType: file.media_type || "application/octet-stream",
    bytes: file.bytes,
    kind: classify({ type: file.media_type }),
    path: file.path,
  }));
}

export function uploadedAttachmentIds(attachmentList: Attachment[]): string[] {
  return [...new Set(attachmentList
    .filter((attachment) => attachment.kind !== "text" && UPLOAD_ID.test(attachment.id))
    .map((attachment) => attachment.id))];
}

export function downloadUrl(attachment: Attachment): string | null {
  return attachment.kind !== "text" && UPLOAD_ID.test(attachment.id)
    ? `/api/uploads/${attachment.id}`
    : null;
}

export function previewUrl(attachment: Attachment): string | null {
  return attachment.kind === "image" ? downloadUrl(attachment) : null;
}

// Older saved chats stored inline text or an image path. New uploads travel as
// attachment_ids and are resolved on the backend before the model sees them.
export function attachmentBlock(attachmentList: Attachment[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const attachment of attachmentList) {
    if (downloadUrl(attachment)) continue;
    const head = `${attachment.name} (${attachment.mediaType}, ${size(attachment.bytes)})`;
    if (attachment.kind === "image" && attachment.path) {
      parts.push(
        `[attached image] ${head}\n` +
        `Path on this machine: ${attachment.path}\n` +
        `Use analyze_image with that path to look at what is in it. ` +
        `To make a NEW picture from it -- same style, combined with ` +
        `another, changed in some way -- pass that path to ` +
        `generate_image as reference_images instead.`,
      );
    } else if (attachment.kind === "text") {
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
  }
  return parts.join("\n\n");
}
