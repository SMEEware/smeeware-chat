import type { NextRequest } from "next/server";

import { PROMPTS_ENDPOINT } from "@/lib/chat/backend";
import { schreiben } from "../route";

type Context = { params: Promise<{ name: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { name } = await context.params;
  return schreiben(
    request,
    "GET",
    `${PROMPTS_ENDPOINT}/${encodeURIComponent(name)}`,
  );
}

export async function DELETE(request: NextRequest, context: Context) {
  const { name } = await context.params;
  return schreiben(
    request,
    "DELETE",
    `${PROMPTS_ENDPOINT}/${encodeURIComponent(name)}`,
  );
}
