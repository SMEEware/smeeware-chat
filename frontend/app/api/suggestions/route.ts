import type { NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_HEADER } from "@/lib/auth/session";
import { CHAT_STREAM_ENDPOINT } from "@/lib/chat/backend";
import { parseSseStream } from "@/lib/chat/stream";
import { FALLBACK_SUGGESTIONS } from "@/lib/chat/suggestions";

const PROMPT = [
  "Suggest three short topics a user could tap to start a conversation with you.",
  "Base them on your own role, expertise and personality as set by your system",
  "instructions -- whatever field that is.",
  "If your role points to no particular field, pick three varied, unrelated",
  "everyday topics instead.",
  "Do not lean on technology, programming or security unless your role is",
  "genuinely about that.",
  "Reply with ONLY a JSON array of exactly three strings.",
  "No other text, no markdown, no code fences.",
  "Each string is a short label of two to four words, in English.",
  'Format: ["Topic one", "Topic two", "Topic three"]',
].join(" ");

const MAX_TOKENS = 1500;

function extractSuggestions(raw: string): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items = parsed
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 60);

  return items.length >= 3 ? items.slice(0, 3) : null;
}

export async function GET(request: NextRequest) {
  const prompt = request.nextUrl.searchParams.get("prompt");

  try {
    const sitzung = request.cookies.get(SESSION_COOKIE)?.value;
    const upstream = await fetch(CHAT_STREAM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sitzung ? { [SESSION_HEADER]: sitzung } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: MAX_TOKENS,
        ...(prompt ? { prompt } : {}),
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    let text = "";
    for await (const frame of parseSseStream(upstream.body, request.signal)) {
      if (frame.type === "content") text += frame.delta;
    }

    return Response.json({
      suggestions: extractSuggestions(text) ?? FALLBACK_SUGGESTIONS,
    });
  } catch {
    return Response.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
}
