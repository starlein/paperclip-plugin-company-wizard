export interface AiConfigMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const AI_CONFIG_REPAIR_PROMPT = `The previous response could not be parsed as JSON. Return ONLY the complete configuration JSON object, with no recommendation, explanation, markdown fence, or comments. Preserve every requirement and field from the previous response. Use valid JSON: escape newlines and quotes inside strings, keep repository URLs intact, and remove trailing commas.`;

function isConfig(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    typeof record.preset === 'string' &&
    record.preset.trim().length > 0
  );
}

/**
 * Repair common model-produced JSON mistakes without changing string contents.
 * In particular, comments are removed only outside strings, so an https:// URL
 * can never be mistaken for a line comment.
 */
function normalizeJsonSyntax(raw: string): string {
  let normalized = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const next = raw[i + 1];

    if (inString) {
      if (escaped) {
        normalized += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        normalized += char;
        escaped = true;
        continue;
      }
      if (char === '"') {
        normalized += char;
        inString = false;
        continue;
      }
      if (char === '\n') normalized += '\\n';
      else if (char === '\r') normalized += '\\r';
      else if (char === '\t') normalized += '\\t';
      else if (char === '\b') normalized += '\\b';
      else if (char === '\f') normalized += '\\f';
      else if (char.charCodeAt(0) < 0x20) {
        normalized += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
      } else normalized += char;
      continue;
    }

    if (char === '"') {
      normalized += char;
      inString = true;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i + 1 < raw.length && raw[i + 1] !== '\n' && raw[i + 1] !== '\r') i++;
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      if (i < raw.length) i++;
      continue;
    }
    normalized += char;
  }

  let withoutTrailingCommas = '';
  inString = false;
  escaped = false;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inString) {
      withoutTrailingCommas += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      withoutTrailingCommas += char;
      continue;
    }
    if (char === ',') {
      let lookahead = i + 1;
      while (/\s/.test(normalized[lookahead] || '')) lookahead++;
      if (normalized[lookahead] === '}' || normalized[lookahead] === ']') continue;
    }
    withoutTrailingCommas += char;
  }
  return withoutTrailingCommas;
}

function parseCandidate(raw: string): Record<string, unknown> | null {
  for (const candidate of [raw, normalizeJsonSyntax(raw)]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isConfig(parsed)) return parsed;
    } catch {
      // Try the normalized candidate next.
    }
  }
  return null;
}

/** Extract the first valid Company Wizard config from prose, a fence, or bare JSON. */
export function extractAiConfig(text: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    const trimmed = candidate.trim().replace(/^\uFEFF/, '');
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) addCandidate(trimmed);

  for (const match of text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)) {
    addCandidate(match[1]);
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        addCandidate(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const candidate of candidates) {
    const config = parseCandidate(candidate);
    if (config) return config;
  }
  return null;
}
