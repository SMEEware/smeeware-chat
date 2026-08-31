import type { NextRequest } from "next/server";

import { UPLOADS_ENDPOINT } from "@/lib/chat/backend";

/**
 * Anhaenge ans Backend durchreichen.
 *
 * Das Formular wird als FormData gelesen und neu aufgebaut statt roh
 * weitergeleitet: so setzt fetch die Grenzmarkierung selbst, und wir muessen
 * den Content-Type des Originals nicht von Hand mitschleppen -- eine falsche
 * boundary waere der haeufigste Weg, sich das hier kaputtzumachen.
 *
 * Was erlaubt ist und wie gross es sein darf, entscheidet das Backend. Die
 * Regeln hier zu wiederholen hiesse, sie zweimal zu pflegen.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: { message: "Invalid upload." } },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPLOADS_ENDPOINT, {
      method: "POST",
      body: form,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: { message: "Uploads are unavailable." } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
