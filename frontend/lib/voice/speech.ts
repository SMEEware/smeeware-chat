const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export function speakable(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const z = line.trim();
      if (/^\|?\s*:?-{2,}/.test(z) || /^([-*_]\s*){3,}$/.test(z)) return "";
      if (z.startsWith("|")) {
        return z
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(", ");
      }
      return z
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^([-*+]|\d+[.)])\s+/, "");
    })
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(EMOJI, "")
    .replace(/\s*[([{]\s*/g, ", ")
    .replace(/\s*[)\]}]\s*/g, ", ")
    .replace(/\s*(→|⇒|->|=>|—|–)\s*/g, ", ")
    .replace(/[*#_~|<>^\\•·]/g, " ")
    .replace(/,\s*([.,!?;:])/g, "$1")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/^\s*,\s*/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim()
    .replace(/([^\s.!?…:;,])\s*\n\s*/g, "$1. ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function withoutCode(text: string): string {
  const withoutClosed = text.replace(/```[\s\S]*?```/g, "\n");
  const open = withoutClosed.indexOf("```");
  return open === -1 ? withoutClosed : withoutClosed.slice(0, open);
}

const SENTENCE_END = /[.!?…:;](?=\s)|\n/g;

export class SentenceSplitter {
  private cursor = 0;

  push(text: string): string[] {
    return this.cut(withoutCode(text), false);
  }

  flush(text: string): string[] {
    return this.cut(withoutCode(text), true);
  }

  private cut(text: string, isFinal: boolean): string[] {
    const rest = text.slice(this.cursor);
    const sentences: string[] = [];
    let used = 0;

    SENTENCE_END.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_END.exec(rest)) !== null) {
      const end = match.index + match[0].length;
      const chunk = speakable(rest.slice(used, end));
      if (chunk.length >= 12) {
        sentences.push(chunk);
        used = end;
      }
    }
    this.cursor += used;

    if (isFinal) {
      const tail = speakable(text.slice(this.cursor));
      if (tail) sentences.push(tail);
      this.cursor = text.length;
    }
    return sentences;
  }
}

const HALLUCINATIONS = [
  /^untertitel/i,
  /^vielen dank für('s| das)? zu(sehen|schauen|hören)/i,
  /^thanks? (you )?for watching/i,
  /^\W*$/,
  /^(\.\s*)+$/,
  /^(ähm?|hm+|mhm)[.!?]?$/i,
];

export function isRealUtterance(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return !HALLUCINATIONS.some((pattern) => pattern.test(t));
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function isEcho(transcript: string, spokenText: string[]): boolean {
  const heard = words(transcript);
  if (heard.length === 0) return false;
  const vocabulary = new Set(spokenText.flatMap(words));
  if (vocabulary.size === 0) return false;
  const match = heard.filter((w) => vocabulary.has(w)).length;
  return match / heard.length >= 0.6;
}
