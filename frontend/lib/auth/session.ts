/**
 * Die Sitzung zwischen Browser und Backend.
 *
 * Im Cookie steht nur eine Kennung -- ein Zufallswert, der fuer sich
 * genommen nichts entschluesselt. Der Datenschluessel der Chats liegt
 * ausschliesslich im Speicher des Backends und wandert nie hierher.
 *
 * httpOnly, damit kein Skript im Browser die Kennung lesen kann; sameSite
 * lax, damit ein fremder Tab sie nicht mitschickt.
 */

export const SESSION_COOKIE = "smeeware_session";

/** Was das Backend erwartet. */
export const SESSION_HEADER = "X-Session-Id";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // Zwoelf Stunden -- dieselbe Spanne wie SESSION_TTL im Backend. Laenger
  // waere ein Cookie, das auf eine Sitzung zeigt, die es nicht mehr gibt.
  maxAge: 12 * 60 * 60,
} as const;
