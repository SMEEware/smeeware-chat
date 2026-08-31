"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Was an den Einstellungen haengt.
 *
 * Im Browser gespeichert und nicht am Konto: das sind Vorlieben fuer diesen
 * Rechner, keine Daten. Sie durch die verschluesselte Ablage zu schicken
 * hiesse, sie ohne Anmeldung nicht lesen zu koennen -- fuer eine Einstellung,
 * die schon vor dem ersten Chat gelten soll.
 */
type Einstellungen = {
  /** Den Gedankengang im Verlauf einblenden. */
  thinking: boolean;
  /** Werkzeuge an das Modell haengen. */
  tools: boolean;
  /** Dateiname ohne Endung aus prompts/. null = das Default des Backends. */
  prompt: string | null;
  /** Hinweise vom Backend einblenden. */
  notifications: boolean;
  /**
   * Womit gesprochene Eingabe zu Text wird. id aus GET /transcribe/models.
   * null = das Default des Backends -- so bleibt die Wahl gueltig, auch
   * wenn sich dort etwas aendert.
   */
  transcribeModel: string | null;
  /**
   * Womit vorgelesen wird. id aus GET /tts/models. null = das Default des
   * Backends -- so bleibt die Wahl gueltig, auch wenn sich dort etwas
   * aendert.
   */
  ttsModel: string | null;
  /**
   * Die ElevenLabs-Stimme. Leerer String = die Vorgabe aus der .env. Nur
   * fuer ElevenLabs; die gratis Stimme kennt keine Auswahl.
   */
  voiceId: string;
  /**
   * Wurde die Einfuehrung schon gezeigt?
   *
   * Die Vorgabe ist ``true``, und das ist der Kern: die Einfuehrung laeuft
   * nicht, weil jemand zum ersten Mal in diesem Browser sitzt, sondern
   * genau einmal nach dem Anlegen des Kontos. Die Anmeldeseite setzt den
   * Wert dort auf ``false`` -- und nur dort. Andernfalls bekaeme jeder,
   * der seinen Browserspeicher leert, die Tour ein zweites Mal.
   */
  tourGesehen: boolean;

  setThinking: (wert: boolean) => void;
  setTools: (wert: boolean) => void;
  setPrompt: (wert: string | null) => void;
  setNotifications: (wert: boolean) => void;
  setTranscribeModel: (wert: string | null) => void;
  setTtsModel: (wert: string | null) => void;
  setVoiceId: (wert: string) => void;
  setTourGesehen: (wert: boolean) => void;
};

export const useSettings = create<Einstellungen>()(
  persist(
    (set) => ({
      thinking: true,
      tools: true,
      prompt: null,
      notifications: true,
      transcribeModel: null,
      ttsModel: null,
      voiceId: "",
      tourGesehen: true,

      setThinking: (thinking) => set({ thinking }),
      setTools: (tools) => set({ tools }),
      setPrompt: (prompt) => set({ prompt }),
      setNotifications: (notifications) => set({ notifications }),
      setTranscribeModel: (transcribeModel) => set({ transcribeModel }),
      setTtsModel: (ttsModel) => set({ ttsModel }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setTourGesehen: (tourGesehen) => set({ tourGesehen }),
    }),
    { name: "smeeware:settings" },
  ),
);

/**
 * Aus ``default`` wird ``Default``, aus ``quick`` wird ``Quick``.
 *
 * Nicht der ``title`` aus der API: der ist dort die erste Textzeile des
 * Prompts -- als Beschreibung brauchbar, als Eintrag in einer Auswahl zu
 * lang und in jeder Zeile anders lang.
 */
export function promptLabel(name: string): string {
  return name
    .split(/[-_]/)
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1))
    .join(" ");
}
