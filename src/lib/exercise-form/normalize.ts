/** Normalize a plan/tracker exercise name into a MuscleWiki search query. */
export function normalizeExerciseQuery(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[:|].*$/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(each|side|per|arm|leg|alt|alternating)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const EXERCISE_ALIASES: Record<string, string> = {
  rdl: 'romanian deadlift',
  rdls: 'romanian deadlift',
  ohp: 'overhead press',
  'military press': 'overhead press',
  'skull crusher': 'lying tricep extension',
  'skull crushers': 'lying tricep extension',
  skullcrusher: 'lying tricep extension',
  skullcrushers: 'lying tricep extension',
  'lat pull down': 'lat pulldown',
  'lat pull downs': 'lat pulldown',
  'face pulls': 'face pull',
  'hip thrusts': 'hip thrust',
  pullups: 'pull up',
  'pull ups': 'pull up',
  chinups: 'chin up',
  'chin ups': 'chin up',
  pushups: 'push up',
  'push ups': 'push up',
}

/** Expand coach nicknames/abbreviations into a MuscleWiki-friendly search query. */
export function applyExerciseAliases(query: string): string {
  const key = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!key) return key
  if (EXERCISE_ALIASES[key]) return EXERCISE_ALIASES[key]
  return key
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\s+/g, ' ')
    .trim()
}

const SKIP_EXACT = new Set([
  'rest',
  'recovery',
  'off',
  'notes',
  'note',
  'warmup',
  'warm up',
  'cooldown',
  'cool down',
  'post workout',
  'stretching',
  'stretch',
])

/** True when this line is not a real lift we should look up. */
export function shouldSkipExerciseForm(name: string): boolean {
  const key = normalizeExerciseQuery(name)
  if (key.length < 3) return true
  if (SKIP_EXACT.has(key)) return true
  if (/^(rest|recovery)(\s+day)?$/.test(key)) return true
  if (name.length > 64 || name.split(/\s+/).length > 10) return true
  if (
    /^(focus on|keep the|remember|make sure|these are|this is|today we)\b/i.test(name.trim())
  ) {
    return true
  }
  return false
}

export function matchScore(query: string, candidateName: string): number {
  const q = query.toLowerCase().trim()
  const n = candidateName.toLowerCase().trim()
  if (!q || !n) return 0
  if (n === q) return 100
  if (n.includes(q) || q.includes(n)) return 82
  const tokens = q.split(/\s+/).filter((t) => t.length > 1)
  if (tokens.length === 0) return 0
  const hits = tokens.filter((t) => n.includes(t)).length
  return Math.round((hits / tokens.length) * 70)
}
