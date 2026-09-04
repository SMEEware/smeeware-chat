import type { ModelList } from "@/lib/chat/types";

export const FALLBACK_MODELS: ModelList = {
  count: 1,
  default: "deepseek-v4-flash",
  groups: ["DeepSeek"],
  models: [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      description: "Fast and cheap — the default for chat.",
      group: "DeepSeek",
      runtime: "hosted",
    },
  ],
};
