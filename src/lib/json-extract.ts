/**
 * Tolerant JSON extraction for weak/free models.
 * Handles markdown fences, prose around the object, trailing commas,
 * and truncated output (auto-closes open brackets/strings).
 */

function stripFences(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json|JSON)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function removeTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === "}" || text[j] === "]") continue; // drop the comma
    }
    out += ch;
  }
  return out;
}

/** Return the balanced JSON slice starting at `start`, closing anything left open. */
function balancedSlice(text: string, start: number): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let end = text.length;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) {
        end = i + 1;
        break;
      }
    }
  }
  let slice = text.slice(start, end);
  if (inString) slice += '"';
  // Truncated output: close whatever remains open, dropping a dangling fragment.
  if (stack.length > 0) {
    slice = slice.replace(/,\s*("[^"]*"\s*:?\s*)?$/, "");
    while (stack.length > 0) slice += stack.pop();
  }
  return slice;
}

export function extractJsonLoose(text: string): unknown {
  const cleaned = stripFences(text);
  const candidates: string[] = [cleaned];

  const start = Math.min(
    ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0).concat([Infinity]),
  );
  if (Number.isFinite(start)) candidates.push(balancedSlice(cleaned, start as number));

  for (const candidate of candidates) {
    for (const attempt of [candidate, removeTrailingCommas(candidate)]) {
      const trimmed = attempt.trim();
      if (!trimmed) continue;
      try {
        return JSON.parse(trimmed);
      } catch {
        /* try next repair */
      }
    }
  }
  throw new Error("Model output was not valid JSON.");
}
