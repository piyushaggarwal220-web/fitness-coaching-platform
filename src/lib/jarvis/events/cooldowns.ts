/**
 * Cooldown keys — prevent investigation storms per fingerprint/entity.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getEventDefinition } from '@/lib/jarvis/events/registry'

export async function isCooldownActive(cooldownKey: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_event_cooldowns')
    .select('expires_at')
    .eq('cooldown_key', cooldownKey)
    .maybeSingle()
  if (error || !data) return false
  return Date.parse(String(data.expires_at)) > Date.now()
}

export async function setCooldown(input: {
  cooldownKey: string
  eventType: string
  fingerprint?: string | null
  seconds?: number
}): Promise<void> {
  const def = getEventDefinition(input.eventType)
  const seconds = input.seconds ?? def.cooldown_seconds
  if (seconds <= 0) return
  const expires = new Date(Date.now() + seconds * 1000).toISOString()
  const admin = createAdminClient()
  await admin.from('jarvis_event_cooldowns').upsert(
    {
      cooldown_key: input.cooldownKey,
      event_type: input.eventType,
      fingerprint: input.fingerprint ?? null,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cooldown_key' }
  )
}

export function cooldownKeyFor(eventType: string, entityId: string | null, funnelId: string | null) {
  return `${eventType}|${entityId || ''}|${funnelId || 'UNCLASSIFIED'}`
}
