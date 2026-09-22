/**
 * Configurable content mix targets — never impose universal ratios.
 */

export type MixTargets = Record<string, number>

export const DEFAULT_MIX: MixTargets = {
  education: 70,
  authority: 20,
  promotion: 10,
}

export function normalizeMix(mix: MixTargets): MixTargets {
  const entries = Object.entries(mix).filter(([, v]) => typeof v === 'number' && v >= 0)
  const sum = entries.reduce((a, [, v]) => a + v, 0)
  if (sum <= 0) return { ...DEFAULT_MIX }
  const out: MixTargets = {}
  for (const [k, v] of entries) {
    out[k] = Math.round((v / sum) * 1000) / 10
  }
  return out
}

export function mixCountsForBatch(posts: number, mix: MixTargets): Record<string, number> {
  const n = Math.max(0, Math.floor(posts))
  const normalized = normalizeMix(mix)
  const pillars = Object.keys(normalized)
  const counts: Record<string, number> = {}
  let assigned = 0
  const ideal = pillars.map((p) => ({
    pillar: p,
    exact: (normalized[p] / 100) * n,
  }))
  ideal.sort((a, b) => b.exact - a.exact)

  for (const { pillar, exact } of ideal) {
    counts[pillar] = Math.floor(exact)
    assigned += counts[pillar]
  }
  let rem = n - assigned
  for (const { pillar } of ideal) {
    if (rem <= 0) break
    counts[pillar] = (counts[pillar] ?? 0) + 1
    rem -= 1
  }
  return counts
}

export function observedMix(pillars: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {}
  let total = 0
  for (const p of pillars) {
    const key = (p || 'unspecified').toLowerCase()
    counts[key] = (counts[key] ?? 0) + 1
    total += 1
  }
  if (total === 0) return {}
  const pct: Record<string, number> = {}
  for (const [k, v] of Object.entries(counts)) {
    pct[k] = Math.round((v / total) * 1000) / 10
  }
  return pct
}

export function pickNextPillar(
  remaining: Record<string, number>,
  recentPillars: string[]
): string | null {
  const entries = Object.entries(remaining).filter(([, n]) => n > 0)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  const last = recentPillars[recentPillars.length - 1]
  const preferred = entries.find(([p]) => p !== last) ?? entries[0]
  return preferred[0]
}
