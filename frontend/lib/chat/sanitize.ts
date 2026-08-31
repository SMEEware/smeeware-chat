/**
 * Entfernt durchgesickertes Werkzeug-Geruest aus einer Modellantwort.
 *
 * Wenn das Tool-Calling im Backend entgleist, landen manchmal rohe
 * Steuertokens oder Klartext-Aufrufe im content-Stream, z. B.
 *   <｜｜DSML｜｜invoke name="fetch_page"> … </｜｜DSML｜｜invoke>
 * oder als Klartext
 *   fetch_page
 *   url=https://…
 * Beides soll der Nutzer nicht sehen -- und es darf auch nicht als
 * Verlauf ans Backend zurueckgehen.
 */

// DeepSeek-Steuertokens verwenden Vollbreite-Pipes (U+FF5C) und U+2581.
// Taucht so ein Token im sichtbaren Text auf, ist die Generierung
// entgleist -- ab da wird alles abgeschnitten (die Bloecke stehen am Ende).
const CONTROL_MARKER = /[｜]{1,2}\s*(?:DSML|tool[▁_ ]?calls?|tool[▁_ ]?call)/i;

function cutControlBlock(text: string): string {
  const match = text.match(CONTROL_MARKER);
  if (!match || match.index === undefined) return text;

  const at = match.index;
  // Bis zur umschliessenden Klammer zuruecklaufen, falls direkt davor.
  const lt = text.lastIndexOf("<", at);
  const cut = lt >= 0 && at - lt <= 4 ? lt : at;
  return text.slice(0, cut);
}

const BARE_WORD = /^[a-z][a-z0-9_]{1,30}$/;
const ASSIGNMENT = /^[a-z_]+\s*=/;
const REASONING_MARKER = /^(?:Reasoning|Thinking)$/;

function stripPlainCalls(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Alleinstehende "Reasoning"/"Thinking"-Marker -- der Abschnittstitel
    // des Gedankengangs, der in den content geraten ist.
    if (REASONING_MARKER.test(trimmed)) continue;

    // Ein nackter Bezeichner (fetch_page, web_search …), dem eine
    // key=value-Zeile folgt, ist ein durchgesickerter Werkzeugaufruf.
    if (BARE_WORD.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;

      if (j < lines.length && ASSIGNMENT.test(lines[j].trim())) {
        // Den Bezeichner samt folgender key=value-Zeilen ueberspringen.
        i = j;
        while (i + 1 < lines.length && ASSIGNMENT.test(lines[i + 1].trim())) {
          i++;
        }
        continue;
      }
    }

    out.push(lines[i]);
  }

  return out.join("\n");
}

export function stripToolScaffolding(text: string): string {
  if (!text) return text;
  // Schnellpfad: nichts Verdaechtiges drin -> unveraendert zurueck.
  if (
    !text.includes("｜") &&
    !/^[a-z][a-z0-9_]{1,30}$/m.test(text) &&
    !/^(?:Reasoning|Thinking)$/m.test(text)
  ) {
    return text;
  }

  const cleaned = stripPlainCalls(cutControlBlock(text))
    // Mehr als eine Leerzeile am Stueck zusammenfassen.
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return cleaned;
}
