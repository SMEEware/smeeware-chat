"use client";

import * as React from "react";

import { useSound } from "@/hooks/use-sound";

export const LOGIN_CHIME_FLAG = "smee:login-chime";

export function LoginChime() {
  const playSpeech = useSound("/assets/sounds/login_successfull.mp3");

  React.useEffect(() => {
    let marked = false;
    try {
      marked = sessionStorage.getItem(LOGIN_CHIME_FLAG) === "1";
      if (marked) sessionStorage.removeItem(LOGIN_CHIME_FLAG);
    } catch {
    }
    if (marked) playSpeech();
  }, [playSpeech]);

  return null;
}
