const CONTROL_MARKER = /[｜]{1,2}\s*(?:DSML|tool[▁_ ]?calls?|tool[▁_ ]?call)/i;

function cutControlBlock(text: string): string {
  const match = text.match(CONTROL_MARKER);
  if (!match || match.index === undefined) return text;

  const at = match.index;
  const lt = text.lastIndexOf("<", at);
  const cut = lt >= 0 && at - lt <= 4 ? lt : at;
  return text.slice(0, cut);
}

const BARE_WORD = /^[a-z][a-z0-9_]{1,30}$/;
const ASSIGNMENT = /^[a-z_]+\s*=/;
const REASONING_MARKER = /^(?:Reasoning|Thinking)$/;

function stripPlainCalls(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (REASONING_MARKER.test(trimmed)) continue;

    if (BARE_WORD.test(trimmed)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;

      if (j < lines.length && ASSIGNMENT.test(lines[j].trim())) {
        i = j;
        while (i + 1 < lines.length && ASSIGNMENT.test(lines[i + 1].trim())) {
          i++;
        }
        continue;
      }
    }

    out.push(lines[i]);
  }

  return out.join("\n");
}

export function stripToolScaffolding(text: string): string {
  if (!text) return text;
  if (
    !text.includes("｜") &&
    !/^[a-z][a-z0-9_]{1,30}$/m.test(text) &&
    !/^(?:Reasoning|Thinking)$/m.test(text)
  ) {
    return text;
  }

  const cleaned = stripPlainCalls(cutControlBlock(text))
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return cleaned;
}
