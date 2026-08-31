import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Das Tor vor dem Chat.
 *
 * Hiess bis Next 16 "middleware" -- die Datei ist dieselbe Sache unter
 * neuem Namen, das alte Konvention ist abgekuendigt.
 *
 * Geprueft wird hier nur, ob ueberhaupt ein Cookie da ist. Ob die Sitzung
 * noch gilt, weiss allein das Backend, das den Datenschluessel haelt --
 * und diese Schicht soll laut Next ohnehin nichts mit dem Rest teilen, weil
 * sie getrennt ausgeliefert werden kann. Sie erspart nur den Umweg ueber
 * eine Seite, die dann doch nichts anzeigen koennte; die eigentliche Sperre
 * sitzt an den Daten.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const ziel = new URL("/login", request.url);
  // Nach dem Anmelden dorthin zurueck, wo jemand hinwollte.
  ziel.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(ziel);
}

export const config = {
  // Nur der Chat. Landing und Doku bleiben offen -- sie tragen nichts,
  // was geschuetzt werden muesste.
  matcher: ["/chat/:path*"],
};
