import { TRANSCRIBE_ENDPOINT } from "@/lib/chat/backend";

export async function GET() {
  try {
    const upstream = await fetch(`${TRANSCRIBE_ENDPOINT}/models`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ count: 0, default: "", groups: [], models: [] });
  }
}
