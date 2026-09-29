import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHAT_STREAM_ENDPOINT } from "@/lib/chat/backend";

/**
 * Nachrichten in einen laufenden Turn schieben (POST) oder zuruecknehmen
 * (DELETE). Das Backend nimmt sie an der naechsten Rundengrenze auf.
 *
 * Die ids landen im Pfad der Backend-URL -- deshalb streng gepruefte Zeichen
 * statt einfach weitergereicht.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function sitzung(request: NextRequest): Record<string, string> {
  const wert = request.cookies.get(SESSION_COOKIE)?.value;
  return wert ? { [SESSION_HEADER]: wert } : {};
}

function fail(message: string, status: number) {
  return Response.json({ error: { message } }, { status });
}

async function weiter(upstream: Promise<Response>) {
  try {
    const antwort = await upstream;
    return new Response(antwort.body, {
      status: antwort.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return fail("Backend unreachable.", 502);
  }
}

export async function POST(request: NextRequest) {
  let body: { stream_id?: string; id?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }
  const { stream_id, id, content } = body;
  if (!stream_id || !ID.test(stream_id) || !id || !ID.test(id) || !content) {
    return fail("stream_id, id and content are required.", 400);
  }

  return weiter(
    fetch(`${CHAT_STREAM_ENDPOINT}/${stream_id}/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sitzung(request) },
      body: JSON.stringify({ id, content }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    }),
  );
}

export async function DELETE(request: NextRequest) {
  const streamId = request.nextUrl.searchParams.get("stream_id") ?? "";
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!ID.test(streamId) || !ID.test(id)) {
    return fail("stream_id and id are required.", 400);
  }

  return weiter(
    fetch(`${CHAT_STREAM_ENDPOINT}/${streamId}/steer/${id}`, {
      method: "DELETE",
      headers: sitzung(request),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    }),
  );
}
