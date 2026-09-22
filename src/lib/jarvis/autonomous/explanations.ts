/**
 * “Why are you telling me this?” — structured explanation.
 */

import { formatDiagnosisExplanation } from '@/lib/jarvis/autonomous/diagnosis'
import type { AttentionItem } from '@/lib/jarvis/autonomous/types'
import { listOpenAttention } from '@/lib/jarvis/autonomous/store'

export function explainAttentionItem(item: AttentionItem): string {
  const d = item.diagnosis ?? {
    observed: [item.observation],
    inferred: [],
    uncertain: ['Root cause not established.'],
    recommendation: [item.next_action],
  }
  return [
    formatDiagnosisExplanation(d),
    '',
    `APPROVAL: ${item.requires_approval ? 'Significant action would require human approval.' : 'No significant write proposed yet.'}`,
    `SEVERITY: ${item.severity}`,
    `SYSTEM: ${item.system}`,
    item.occurrence_count && item.occurrence_count > 1
      ? `OCCURRENCES: ${item.occurrence_count} (deduplicated incident)`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function explainWhyTelling(fingerprintOrTitle?: string): Promise<string> {
  const items = await listOpenAttention(30)
  if (!items.length) {
    return 'No open attention items. Quiet operation — nothing meaningful to escalate.'
  }
  if (!fingerprintOrTitle) {
    const top = items[0]
    return explainAttentionItem(top)
  }
  const needle = fingerprintOrTitle.toLowerCase()
  const match =
    items.find((i) => i.fingerprint === fingerprintOrTitle) ||
    items.find((i) => i.title.toLowerCase().includes(needle))
  if (!match) {
    return `No matching attention item for “${fingerprintOrTitle}”.`
  }
  return explainAttentionItem(match)
}
