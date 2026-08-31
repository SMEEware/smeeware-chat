import type { ModelList } from "@/lib/chat/types";

/**
 * Ausweichliste, falls /models nicht erreichbar ist. Haelt den Chat mit
 * dem Standardmodell bedienbar, statt eine leere Auswahl zu zeigen.
 *
 * Bewusst nur ein Eintrag: was wirklich waehlbar ist, haengt an Schluesseln
 * und laufenden Diensten, und das weiss nur das Backend. Hier eine volle
 * Liste zu raten hiesse, Modelle anzubieten, die vielleicht gar nicht gehen.
 */
export const FALLBACK_MODELS: ModelList = {
  count: 1,
  default: "deepseek-v4-flash",
  groups: ["DeepSeek"],
  models: [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      description: "Fast and cheap — the default for chat.",
      group: "DeepSeek",
      runtime: "hosted",
    },
  ],
};
