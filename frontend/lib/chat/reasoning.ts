import type { Model, ModelList } from "@/lib/chat/types";

export function supportedReasoningEfforts(model?: Model): string[] {
  const efforts = model?.reasoning_efforts;
  if (!Array.isArray(efforts)) return [];
  return [...new Set(efforts.filter(
    (effort): effort is string =>
      typeof effort === "string" && effort.length > 0 && effort.trim() === effort,
  ))];
}

export function chosenReasoningEffort(
  model?: Model,
  preference?: string,
): string | undefined {
  const efforts = supportedReasoningEfforts(model);
  if (preference && efforts.includes(preference)) return preference;
  if (model?.reasoning_effort && efforts.includes(model.reasoning_effort)) {
    return model.reasoning_effort;
  }
  return efforts[0];
}

export function reasoningEffortForModel(
  list: ModelList | undefined,
  modelId: string | null,
  preferences: Record<string, string>,
): string | undefined {
  const id = modelId ?? list?.default;
  const model = list?.models?.find((candidate) => candidate.id === id);
  return chosenReasoningEffort(model, id ? preferences[id] : undefined);
}
