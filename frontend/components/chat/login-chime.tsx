"use client";

import * as React from "react";

import { useSound } from "@/hooks/use-sound";

/** Die Anmeldeseite hinterlaesst diese Markierung, kurz bevor sie hart
 *  hierher navigiert -- der Klang selbst ueberlebt den Reload nicht. */
export const LOGIN_CHIME_FLAG = "smee:login-chime";

/**
 * Spielt den Anmelde-Klang genau einmal -- nach der Weiterleitung von der
 * Anmeldeseite in den Chat.
 *
 * Warum ueber sessionStorage und nicht direkt beim Klick auf "Sign in": von
 * dort fuehrt eine harte Navigation hierher, die jeden gerade startenden Ton
 * abschneidet. Also setzt die Anmeldeseite eine Markierung, und der Klang
 * ertoent erst, wenn der Chat geladen ist. Verweigert der Browser das
 * Abspielen (Autoplay-Politik), bleibt es still -- ohne Fehler.
 */
export function LoginChime() {
  const spiele = useSound("/assets/sounds/login_successfull.mp3");

  React.useEffect(() => {
    let markiert = false;
    try {
      markiert = sessionStorage.getItem(LOGIN_CHIME_FLAG) === "1";
      if (markiert) sessionStorage.removeItem(LOGIN_CHIME_FLAG);
    } catch {
      // sessionStorage kann blockiert sein (privater Modus o. ae.) -- dann
      // eben kein Klang.
    }
    if (markiert) spiele();
  }, [spiele]);

  return null;
}
