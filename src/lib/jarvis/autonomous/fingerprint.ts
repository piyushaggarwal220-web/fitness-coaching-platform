/**
 * Stable fingerprints for attention / incident deduplication.
 */

import { createHash } from 'node:crypto'

export function attentionFingerprint(parts: {
  system: string
  title: string
  key?: string | null
}): string {
  const raw = `${parts.system}|${parts.title}|${parts.key ?? ''}`.toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

export function opportunityFingerprint(system: string, title: string): string {
  return attentionFingerprint({ system, title, key: 'opportunity' })
}
