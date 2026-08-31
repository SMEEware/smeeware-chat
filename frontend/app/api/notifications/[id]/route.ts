import type { NextRequest } from "next/server";

import { NOTIFICATIONS_ENDPOINT } from "@/lib/chat/backend";
import { weiter } from "../route";

type Context = { params: Promise<{ id: string }> };

/** Einen einzelnen Hinweis loeschen. */
export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return weiter(
    request,
    "DELETE",
    `${NOTIFICATIONS_ENDPOINT}/${encodeURIComponent(id)}`,
  );
}
