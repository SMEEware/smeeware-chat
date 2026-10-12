import type { NextRequest } from "next/server";

import { NOTIFICATIONS_ENDPOINT } from "@/lib/chat/backend";
import { relay } from "../route";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return relay(
    request,
    "DELETE",
    `${NOTIFICATIONS_ENDPOINT}/${encodeURIComponent(id)}`,
  );
}
