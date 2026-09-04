"use client";

import * as React from "react";

import { useSound } from "@/hooks/use-sound";

export const LOGIN_CHIME_FLAG = "smee:login-chime";

export function LoginChime() {
  const spiele = useSound("/assets/sounds/login_successfull.mp3");

  React.useEffect(() => {
    let markiert = false;
    try {
      markiert = sessionStorage.getItem(LOGIN_CHIME_FLAG) === "1";
      if (markiert) sessionStorage.removeItem(LOGIN_CHIME_FLAG);
    } catch {
    }
    if (markiert) spiele();
  }, [spiele]);

  return null;
}
