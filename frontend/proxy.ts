import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Das Tor vor dem Chat.
 *
 * Hiess bis Next 16 "middleware" -- die Datei ist dieselbe Sache unter
 * neuem Namen, die alte Konvention ist abgekuendigt.
 *
 * Was hier NICHT mehr passiert: ein einzelner Chat wird nicht mehr pauschal
 * gesperrt. Ein geteilter Verlauf soll sich ohne Konto ansehen lassen, und
 * ob er geteilt ist, weiss allein die Datenbank. Das hier nachzuschlagen
 * hiesse, bei jedem anonymen Aufruf eine Abfrage vorzuschalten -- wovon die
 * Next-Doku fuer diese Schicht ausdruecklich abraet ("not intended for slow
 * data fetching ... should not be used as a full session management or
 * authorization solution").
 *
 * Die Entscheidung faellt deshalb in der Seite: angemeldet -> der eigene
 * Verlauf; sonst -> der Versuch am oeffentlichen Endpunkt, und erst wenn der
 * nichts hergibt, geht es zur Anmeldung.
 *
 * Das ist keine Lockerung der Sperre. Die sitzt an den Daten und nicht an
 * der Adresse: ``/api/v1/chats/*`` antwortet ohne Sitzung mit 401, und der
 * oeffentliche Endpunkt kennt ausschliesslich die Tabelle der geteilten
 * Kopien. Ueber diesen Weg ist kein privater Verlauf erreichbar.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // Ein einzelner Chat darf durch -- er koennte geteilt sein.
  if (CHAT_MIT_ID.test(request.nextUrl.pathname)) return NextResponse.next();

  // Alles andere unter /chat setzt ein Konto voraus. Vor allem /chat selbst:
  // das ist der Einstieg in einen NEUEN Verlauf, und den kann nur fuehren,
  // wer angemeldet ist.
  const ziel = new URL("/login", request.url);
  ziel.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(ziel);
}

/** ``/chat/<id>`` -- dieselbe Form, die auch das Backend akzeptiert. */
const CHAT_MIT_ID = /^\/chat\/[A-Za-z0-9_-]{1,64}\/?$/;

export const config = {
  // Nur der Chat. Landing und Doku bleiben offen -- sie tragen nichts,
  // was geschuetzt werden muesste.
  matcher: ["/chat/:path*"],
};
