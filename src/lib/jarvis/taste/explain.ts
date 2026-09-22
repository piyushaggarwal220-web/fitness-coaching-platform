/**
 * Evidence-backed taste explanations.
 * Never fabricate reasons.
 */

import type { TasteEvidence, TastePreference } from '@/lib/jarvis/taste/types'

export function explainPreference(input: {
  preference: TastePreference
  evidence: TasteEvidence[]
}): { ok: boolean; explanation: string; evidence_summaries: string[] } {
  const p = input.preference
  const evidence = input.evidence
  if (!evidence.length && p.evidence_count === 0) {
    return {
      ok: false,
      explanation: 'No evidence on record for this preference.',
      evidence_summaries: [],
    }
  }

  const summaries = evidence.slice(0, 8).map((e) => {
    const bits = [
      e.evidence_type,
      e.signal,
      e.feedback_text ? `feedback: "${e.feedback_text.slice(0, 80)}"` : null,
      e.diff_summary ? `diff: ${e.diff_summary.slice(0, 80)}` : null,
      e.edl_version != null ? `EDL v${e.edl_version}` : null,
    ].filter(Boolean)
    return bits.join(' · ')
  })

  const explanation =
    p.explanation ||
    `I treat ${p.dimension.toLowerCase()} ${p.preference_key.replace(/_/g, ' ')} as "${p.preference_value}" ` +
      `because of ${p.evidence_count} supporting event(s) ` +
      `(confidence ${Math.round(p.confidence * 100)}%, status ${p.status}, mode ${p.influence_mode}).`

  return { ok: true, explanation, evidence_summaries: summaries }
}

export function explainEditChoice(input: {
  choice: string
  matching: TastePreference | null
  evidence: TasteEvidence[]
}): string {
  if (!input.matching) {
    return `I made this edit choice (${input.choice}) from the creative plan / current instruction — not from a stored taste preference.`
  }
  const ex = explainPreference({
    preference: input.matching,
    evidence: input.evidence,
  })
  if (!ex.ok) {
    return `I applied ${input.matching.preference_key}=${input.matching.preference_value}, but evidence details are unavailable.`
  }
  return `I ${input.choice} because ${ex.explanation}`
}
