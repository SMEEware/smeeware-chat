import { VOICE_ENDPOINT } from "@/lib/chat/backend";

/** Die waehlbaren Stimmen des Telefonats. */
export async function GET() {
  try {
    const upstream = await fetch(`${VOICE_ENDPOINT}/voices`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { error: { message: "Voices unavailable." } },
      { status: 502 },
    );
  }
}
