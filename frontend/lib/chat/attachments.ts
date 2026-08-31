/**
 * Dateien am Prompt -- Einordnen, Einlesen, Hochladen, Einfalten.
 *
 * Zwei Wege, weil das Backend zwei Wege hat. Text kann direkt in die
 * Nachricht: das Modell liest ihn als Teil der Frage, niemand muss ihn
 * irgendwo ablegen. Bilder koennen das nicht -- das Hauptmodell sieht keine
 * Bilder, und base64 im Prompt spraengt bei rund 24 KB Bild ohnehin das
 * 32.000-Zeichen-Limit von ``ChatMessage.content``. Sie gehen deshalb auf
 * die Platte des Backends, und in die Nachricht wandert nur ihr Pfad, den
 * der Agent an ``analyze_image`` weiterreicht.
 */

import type { Attachment } from "@/lib/chat/types";

/** Je Textdatei. Darueber wird gekuerzt und das an der Zeile vermerkt. */
export const TEXT_MAX_CHARS = 12_000;

/** Summe aller eingebetteten Texte -- schuetzt das 32k-Limit der Nachricht. */
export const TEXT_TOTAL_BUDGET = 24_000;

/** Muss zu UPLOADS_MAX_FILES im Backend passen. */
export const MAX_ATTACHMENTS = 8;

/** Muss zu UPLOADS_MAX_BYTES im Backend passen. */
export const IMAGE_MAX_BYTES = 20_000_000;

/** Genau die vier, die der Vision-Dienst ansehen kann. */
const BILD_TYP = /^image\/(png|jpeg|webp|gif)$/i;

/**
 * Was als Text durchgeht. Der Medientyp allein reicht nicht: .ts, .py und
 * .csv kommen je nach System als application/octet-stream oder ganz ohne
 * Typ an. Deshalb entscheidet zusaetzlich die Endung.
 */
const TEXT_TYP =
  /^text\/|^application\/(json|xml|javascript|x-yaml|x-sh|toml|sql)|\+json$|\+xml$/i;

const TEXT_ENDUNG =
  /\.(txt|md|markdown|mdx|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|scss|less|jsx?|tsx?|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|sql|ini|cfg|conf|log|gitignore|dockerfile)$/i;

/**
 * Was der Dateidialog vorschlaegt. Die Endungsliste doppelt bewusst, was
 * TEXT_ENDUNG prueft: der Dialog filtert nach Endung, die Annahme prueft
 * zusaetzlich den Medientyp -- was durch den Dialog kommt, kann trotzdem
 * abgelehnt werden, und was daran vorbeigezogen wird, trotzdem durchgehen.
 */
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

/** null = koennen wir nicht brauchen, und das sagen wir lieber sofort. */
export function einordnen(datei: File): Sorte | null {
  const typ = (datei.type || "").split(";")[0].trim().toLowerCase();
  if (BILD_TYP.test(typ)) return "image";
  if (TEXT_TYP.test(typ) || TEXT_ENDUNG.test(datei.name)) return "text";
  return null;
}

/** Kurz und ohne Nachkommastellen-Theater. */
export function groesse(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const neueId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Textdatei einlesen. Die Kuerzung passiert hier und nicht erst beim
 * Absenden, damit die Zeile im Composer schon sagt, dass gekuerzt wurde --
 * niemand soll erst an der Antwort merken, dass die Haelfte fehlte.
 */
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

/**
 * Bilder zum Backend schicken. Zurueck kommt der Pfad, unter dem die Datei
 * dort liegt -- die einzige Form, mit der ``analyze_image`` etwas anfangen
 * kann, ohne dass die Bytes durch den Verlauf wandern.
 */
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
      // Kein JSON -- der Status muss reichen.
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

/** Woher die Vorschau kommt -- auch noch, wenn der Chat neu geladen wurde. */
export function vorschauUrl(anhang: Attachment): string | null {
  return anhang.kind === "image" ? `/api/uploads/${anhang.id}` : null;
}

/**
 * Was das Modell von den Anhaengen zu sehen bekommt.
 *
 * Bewusst als Text und nicht als eigenes Feld: ``ChatRequest`` im Backend
 * kennt nur ``content``, und daran soll sich nichts aendern muessen, nur
 * weil jemand eine Datei anhaengt. Der Block entsteht erst auf dem Weg zur
 * Leitung -- im Verlauf steht weiter die Frage, die getippt wurde.
 */
export function anhangBlock(anhaenge: Attachment[]): string {
  if (anhaenge.length === 0) return "";

  const teile: string[] = [];
  let verbraucht = 0;

  for (const anhang of anhaenge) {
    const kopf = `${anhang.name} (${anhang.mediaType}, ${groesse(anhang.bytes)})`;

    if (anhang.kind === "image") {
      // Beide Wege nennen, nicht nur einen: das Modell sieht das Bild
      // nie selbst und weiss sonst gar nicht, dass es damit auch etwas
      // Neues machen koennte. Was von beidem gemeint ist, sagt die Frage
      // des Nutzers -- also steht hier die Wahl, nicht die Antwort.
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

    // Der Rest des Budgets, damit viele Dateien zusammen die Nachricht
    // nicht ueber das 32k-Limit des Backends schieben.
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
