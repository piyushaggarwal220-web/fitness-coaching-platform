import { LEAGUE_TIER_LABELS, type LeagueTier } from '@/lib/league/scoring'

export type LeagueCertificatePromptInput = {
  displayName: string
  tier: LeagueTier
  rank: number
  points: number
  monthLabel: string
}

/**
 * ChatGPT (Create image) prompt for a personalised LURVOX virtual certificate.
 * Coaches paste this, generate the image, then send it to the client.
 */
export function buildLeagueCertificateChatGptPrompt(input: LeagueCertificatePromptInput): string {
  const division = LEAGUE_TIER_LABELS[input.tier]
  const name = input.displayName.trim() || 'the member'
  const rankLine = input.rank > 0 ? `Rank #${input.rank}` : 'Top 10%'
  const pointsLine = Number.isFinite(input.points) ? `${input.points} consistency points` : 'consistency points'

  return `Create a premium digital certificate of achievement, landscape 16:9, print-ready.

Brand: LURVOX fitness coaching (India). Dark charcoal/black background, burnt orange #FF6200 as the only accent, cream/white serif for the name, clean sans-serif for the rest. Thin gold-orange border, subtle trophy or laurel motif — elegant, not cartoon, not clipart, no photos of people, no watermarks, no fake signatures.

Title: CERTIFICATE OF ACHIEVEMENT
Presented to: ${name}
Body (exact meaning, you may typeset it beautifully):
This certifies that ${name} finished in the top 10% of the LURVOX Consistency League — ${division} division — for ${input.monthLabel}.
Details line: ${rankLine} · ${pointsLine} · ${division}
Footer: Consistency League · LURVOX · ${input.monthLabel}

Leave modest empty margin for printing. High contrast so the name is the hero. No QR codes. No extra logos besides the word LURVOX.`
}
