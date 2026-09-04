import type { NextRequest } from "next/server";

import { PUBLIC_CHATS_ENDPOINT } from "@/lib/chat/backend";

type Context = { params: Promise<{ id: string }> };

/**
 * Ein geteilter Chat -- ohne Anmeldung lesbar.
 *
 * Hier wird bewusst KEIN Sitzungs-Cookie weitergereicht. Nicht aus
 * Bequemlichkeit: der Endpunkt dahinter kennt nur die Tabelle der geteilten
 * Kopien, und eine mitgeschickte Kennung koennte nur den Eindruck erwecken,
 * sie spiele eine Rolle. Was hier herauskommt, sieht jeder gleich.
 */
export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${PUBLIC_CHATS_ENDPOINT}/${encodeURIComponent(id)}`,
      { signal: request.signal, cache: "no-store" },
    );
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Chat history is unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
