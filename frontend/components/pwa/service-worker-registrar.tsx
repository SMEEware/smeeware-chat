"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const registrieren = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };

    if (document.readyState === "complete") {
      registrieren();
      return;
    }

    window.addEventListener("load", registrieren);
    return () => window.removeEventListener("load", registrieren);
  }, []);

  return null;
}
