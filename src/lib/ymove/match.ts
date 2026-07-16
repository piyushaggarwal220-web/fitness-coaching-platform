/**
 * Normalize a plan exercise name for matching / override lookups.
 * Strips prescription junk like "4x8 @ 60kg", phase labels, etc.
 */
export function normalizeExerciseNameKey(raw: string): string {
  return cleanExerciseSearchQuery(raw).toLowerCase()
}

export function cleanExerciseSearchQuery(raw: string): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''

  // Drop parenthetical cues: Light cardio (walk / jog / bike)
  text = text.replace(/\s*\([^)]*\)\s*/g, ' ')

  // Drop trailing prescription: "Bench Press: 4 sets x 8" / "4x8 @ 60 kg"
  text = text
    .replace(/[:\-–—]\s*\d+\s*sets?\s*[x×].*$/i, '')
    .replace(/\s+\d+\s*[x×]\s*\d+(?:\s*-\s*\d+)?(?:\s*(?:@|at)\s*[\d.]+\s*(?:kg|lbs?))?.*$/i, '')
    .replace(/\s+(?:@|at)\s*[\d.]+\s*(?:kg|lbs?).*$/i, '')
    .replace(/\s+\d+(?:\s*[-–]\s*\d+)?\s*(?:min|mins|minutes|s|sec|secs|seconds)\s*$/i, '')

  // Leading phase labels
  text = text.replace(/^(?:warmup|warm-up|cooldown|cool-down|finisher|mobility|core|accessory)\s*:\s*/i, '')

  return text.replace(/\s+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !['the', 'and', 'with', 'for'].includes(t))
}

/** Score how well a YMove title matches a cleaned plan name (higher is better). */
export function scoreExerciseNameMatch(planName: string, libraryTitle: string): number {
  const a = planName.toLowerCase().trim()
  const b = libraryTitle.toLowerCase().trim()
  if (!a || !b) return -1
  if (a === b) return 1000
  if (b.startsWith(a) || a.startsWith(b)) return 800
  if (b.includes(a) || a.includes(b)) return 600

  const ta = new Set(tokenize(a))
  const tb = tokenize(b)
  if (ta.size === 0) return -1
  let hits = 0
  for (const t of tb) {
    if (ta.has(t)) hits++
  }
  const coverage = hits / ta.size
  if (coverage < 0.5) return -1
  return Math.round(coverage * 400) + hits * 10
}
