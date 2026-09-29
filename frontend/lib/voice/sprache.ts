/**
 * Aus einer Chat-Antwort wird Gesprochenes.
 *
 * Zwei Aufgaben: Markdown so glaetten, dass es sich vorlesen laesst (niemand
 * will "Sternchen Sternchen" oder eine URL hoeren), und aus einem Text, der
 * noch waechst, die Saetze herausschneiden, die schon fertig sind -- damit
 * das Telefonat zu sprechen beginnt, lange bevor die Antwort vollstaendig ist.
 */

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Eine Zeile Markdown in sprechbaren Text verwandeln. */
export function sprechbar(text: string): string {
  return text
    .split("\n")
    .map((zeile) => {
      const z = zeile.trim();
      // Trennzeilen von Tabellen und Linien tragen keinen Inhalt.
      if (/^\|?\s*:?-{2,}/.test(z) || /^([-*_]\s*){3,}$/.test(z)) return "";
      // Tabellenzeile: Zellen mit Komma statt senkrechter Striche.
      if (z.startsWith("|")) {
        return z
          .split("|")
          .map((zelle) => zelle.trim())
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
    // Klammern werden zur Sprechpause statt vorgelesen zu werden, Pfeile und
    // Gedankenstriche ebenso; uebrige Zeichen, die keiner ausspricht, fallen weg.
    .replace(/\s*[([{]\s*/g, ", ")
    .replace(/\s*[)\]}]\s*/g, ", ")
    .replace(/\s*(→|⇒|->|=>|—|–)\s*/g, ", ")
    .replace(/[*#_~|<>^\\•·]/g, " ")
    .replace(/,\s*([.,!?;:])/g, "$1")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/^\s*,\s*/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    // Ein Zeilenumbruch ist beim Sprechen eine Pause: ohne Satzzeichen davor
    // (Ueberschrift, Listenpunkt) wird er zum Punkt, sonst zum Leerzeichen.
    .trim()
    .replace(/([^\s.!?…:;,])\s*\n\s*/g, "$1. ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Der Teil einer (womoeglich noch wachsenden) Antwort, der sich vorlesen
 * laesst: fertige Code-Bloecke fallen weg, und ein Code-Block, der gerade
 * erst begonnen hat, schneidet den Text an seinem Anfang ab -- sonst wuerde
 * sein Inhalt vorgelesen, sobald er ankommt.
 */
function ohneCode(text: string): string {
  const ohneFertige = text.replace(/```[\s\S]*?```/g, "\n");
  const offen = ohneFertige.indexOf("```");
  return offen === -1 ? ohneFertige : ohneFertige.slice(0, offen);
}

const SATZENDE = /[.!?…:;](?=\s)|\n/g;

/**
 * Zerlegt eine wachsende Antwort in vorlesbare Saetze.
 *
 * Merkt sich, bis wohin schon gesprochen wurde; jeder Aufruf mit dem neuen
 * Stand liefert nur die Saetze, die seither fertig geworden sind. ``ende``
 * gibt am Schluss den Rest heraus, auch ohne Satzzeichen.
 */
export class SatzSchneider {
  /** Bis zu dieser Stelle des vorlesbaren Texts ist alles ausgegeben. */
  private bis = 0;

  weiter(text: string): string[] {
    return this.schneide(ohneCode(text), false);
  }

  ende(text: string): string[] {
    return this.schneide(ohneCode(text), true);
  }

  private schneide(text: string, alles: boolean): string[] {
    const rest = text.slice(this.bis);
    const saetze: string[] = [];
    let verbraucht = 0;

    SATZENDE.lastIndex = 0;
    let treffer: RegExpExecArray | null;
    while ((treffer = SATZENDE.exec(rest)) !== null) {
      const ende = treffer.index + treffer[0].length;
      // Sehr kurze Stuecke ("Ja." / eine Aufzaehlungsnummer) warten auf den
      // naechsten Satz -- jeder Satz ist ein eigener Sprachaufruf.
      const stueck = sprechbar(rest.slice(verbraucht, ende));
      if (stueck.length >= 12) {
        saetze.push(stueck);
        verbraucht = ende;
      }
    }
    this.bis += verbraucht;

    if (alles) {
      const letzter = sprechbar(text.slice(this.bis));
      if (letzter) saetze.push(letzter);
      this.bis = text.length;
    }
    return saetze;
  }
}

/** Was Whisper aus Stille und Rauschen gern erfindet. */
const HALLUZINATIONEN = [
  /^untertitel/i,
  /^vielen dank für('s| das)? zu(sehen|schauen|hören)/i,
  /^thanks? (you )?for watching/i,
  /^\W*$/,
  /^(\.\s*)+$/,
  /^(ähm?|hm+|mhm)[.!?]?$/i,
];

/** Taugt ein Transkript als Frage -- oder hat Whisper nur Stille gedeutet? */
export function istEchteAussage(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return !HALLUZINATIONEN.some((muster) => muster.test(t));
}

function woerter(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Hat das Mikrofon nur die eigene Stimme gehoert?
 *
 * Ohne Echo-Unterdrueckung (viele Android-Browser) laeuft die Stimme aus dem
 * Lautsprecher zurueck ins Mikrofon und saehe aus wie ein Dazwischenreden.
 * Verraten tut sie sich am Inhalt: das Transkript besteht dann fast nur aus
 * Woertern, die sie selbst gerade gesagt hat. Ein echter Einwurf ("Nein,
 * nicht Berlin, Paris!") teilt hoechstens ein paar Woerter mit ihr.
 */
export function istEcho(transkript: string, gesprochen: string[]): boolean {
  const gehoert = woerter(transkript);
  if (gehoert.length === 0) return false;
  const vorrat = new Set(gesprochen.flatMap(woerter));
  if (vorrat.size === 0) return false;
  const treffer = gehoert.filter((w) => vorrat.has(w)).length;
  return treffer / gehoert.length >= 0.6;
}
