/**
 * Originality engine — adapt trends; never copy scripts/structure clones.
 */

import type { OriginalAngle, ViralReelRef } from '@/lib/jarvis/instagram/niche/types'

export function originalityFromTrend(input: {
  trend: string
  observed: string
  niche?: string | null
  geography?: string | null
}): OriginalAngle {
  const angles: string[] = []
  const t = `${input.trend} ${input.observed}`.toLowerCase()
  angles.push('beginner mistake framing')
  if (input.geography === 'INDIA' || /india|indian/.test(t)) {
    angles.push('Indian diet / lifestyle example')
  }
  angles.push('personal coaching experience')
  if (/myth|wrong|secret/.test(t)) angles.push('myth correction')
  angles.push('practical checklist')
  if (/fat.?loss|belly/.test(t)) angles.push('fat-loss coaching CTA (soft)')
  if (/protein|nutrition/.test(t)) angles.push('nutrition education with local food examples')

  return {
    trend: input.trend,
    observed: input.observed,
    angles: [...new Set(angles)].slice(0, 6),
    note: 'Original angles only — never copy another creator script, exact wording, or near-clone structure.',
  }
}

export function originalityFromReel(reel: ViralReelRef): OriginalAngle {
  return originalityFromTrend({
    trend: String(reel.topic || reel.niche || 'fitness reel'),
    observed: reel.hook || reel.title || 'pattern from public reference',
    niche: reel.niche ? String(reel.niche) : null,
    geography: reel.geography,
  })
}

export function forbidCopyLanguage(text: string): boolean {
  return /\b(copy (?:their|his|her) script|clone (?:their|this) (?:video|reel)|reproduce (?:exact|verbatim))\b/i.test(
    text
  )
}
