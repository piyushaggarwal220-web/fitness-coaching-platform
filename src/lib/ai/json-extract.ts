/** Candidate JSON strings extracted from model output, best-first. */
export function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim()
  const candidates: string[] = []
  const seen = new Set<string>()

  function add(candidate: string | null | undefined): void {
    const value = candidate?.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    candidates.push(value)
  }

  // Full-string fenced block
  const fullFence = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fullFence) add(fullFence[1])

  // Any fenced blocks in the response (preamble/commentary allowed)
  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)\s*```/gi
  let fenceMatch: RegExpExecArray | null
  while ((fenceMatch = fencePattern.exec(trimmed)) !== null) {
    add(fenceMatch[1])
  }

  // Brace-balanced root object
  add(extractBalancedJsonObject(trimmed))

  // First { to last } fallback
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) {
    add(trimmed.slice(start, end + 1))
  }

  add(trimmed)
  return candidates
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

/** Normalize common model JSON formatting issues before parse. */
export function repairJsonText(text: string): string {
  let output = text
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim()

  // Trailing commas before } or ]
  output = output.replace(/,\s*([}\]])/g, '$1')

  return output
}

/**
 * Attempt to fix unescaped literal newlines/tabs inside JSON string values.
 * Models sometimes emit multi-line strings without \\n escapes.
 */
export function escapeUnescapedControlCharsInJsonStrings(text: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!

    if (!inString) {
      result += ch
      if (ch === '"') inString = true
      continue
    }

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      result += ch
      inString = false
      continue
    }

    if (ch === '\n') {
      result += '\\n'
      continue
    }
    if (ch === '\r') {
      result += '\\r'
      continue
    }
    if (ch === '\t') {
      result += '\\t'
      continue
    }

    result += ch
  }

  return result
}

export function parseJsonFromModelResponse(text: string): {
  parsed: unknown | null
  error: string | null
} {
  const candidates = extractJsonCandidates(text)
  const repairs = [
    (s: string) => s,
    repairJsonText,
    (s: string) => repairJsonText(escapeUnescapedControlCharsInJsonStrings(s)),
    (s: string) => escapeUnescapedControlCharsInJsonStrings(repairJsonText(s)),
  ]

  for (const candidate of candidates) {
    for (const repair of repairs) {
      try {
        return { parsed: JSON.parse(repair(candidate)), error: null }
      } catch {
        // try next repair strategy
      }
    }
  }

  return { parsed: null, error: 'Response is not valid JSON.' }
}
