/**
 * CTA engine — objective-aligned, never defaults to sales for every post.
 */

import type { CreativeObjective } from '@/lib/jarvis/creative/types'

const CTA_BY_OBJECTIVE: Record<CreativeObjective, string> = {
  AWARENESS: 'Follow for more practical fitness tips.',
  AUTHORITY: 'Save this and share with someone who needs it.',
  ENGAGEMENT: 'Comment your experience below.',
  EDUCATION: 'Save this for later.',
  LEAD_GENERATION: 'DM me “PLAN” if you want help.',
  SALES: 'Check the program link in bio.',
  RETENTION: 'Follow so you don’t miss the next tip.',
  TRUST: 'Follow for honest coaching, not hype.',
  COMMUNITY: 'Tag a training partner.',
}

export function normalizeObjective(raw?: string | null): CreativeObjective {
  const t = (raw || '').toUpperCase().replace(/\s+/g, '_')
  // Funnel / offer language → sales before generic "leads"
  if (t.includes('SALE') || t.includes('FUNNEL') || t.includes('99') || t.includes('₹')) return 'SALES'
  if (t.includes('LEAD') || t.includes('DM')) return 'LEAD_GENERATION'
  if (t.includes('AUTHOR')) return 'AUTHORITY'
  if (t.includes('ENGAGE') || t.includes('COMMENT')) return 'ENGAGEMENT'
  if (t.includes('AWARE')) return 'AWARENESS'
  if (t.includes('RETAIN')) return 'RETENTION'
  if (t.includes('TRUST')) return 'TRUST'
  if (t.includes('COMMUNITY')) return 'COMMUNITY'
  if (t.includes('EDUCAT') || t.includes('TEACH')) return 'EDUCATION'
  return 'EDUCATION'
}

export function pickCta(input: {
  objective: CreativeObjective
  explicitCta?: string | null
  funnelHint?: string | null
}): { cta: string; matches_objective: boolean } {
  if (input.explicitCta?.trim()) {
    return { cta: input.explicitCta.trim().slice(0, 160), matches_objective: true }
  }
  let cta = CTA_BY_OBJECTIVE[input.objective]
  if (input.funnelHint && (input.objective === 'SALES' || input.objective === 'LEAD_GENERATION')) {
    cta = `Learn more about the ${input.funnelHint.slice(0, 40)} offer — link in bio.`
  }
  return { cta, matches_objective: true }
}

export function ctaMatchesObjective(cta: string, objective: CreativeObjective): boolean {
  const t = cta.toLowerCase()
  if (objective === 'SALES') return /program|buy|link|offer|₹|funnel/.test(t)
  if (objective === 'LEAD_GENERATION') return /dm|message|plan|apply|book/.test(t)
  if (objective === 'ENGAGEMENT') return /comment|reply|tell me|tag/.test(t)
  if (objective === 'EDUCATION' || objective === 'AUTHORITY') return /save|share|follow/.test(t)
  if (objective === 'AWARENESS') return /follow/.test(t)
  return true
}
