/**
 * In-process + DB-backed execution locks (conflict prevention).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const memoryLocks = new Map<string, { owner: string; expires: number }>()

export async function acquireExecutionLock(input: {
  lockKey: string
  owner: string
  ttlSeconds?: number
}): Promise<{ ok: boolean; reason?: string }> {
  const ttl = input.ttlSeconds ?? 120
  const now = Date.now()
  const existing = memoryLocks.get(input.lockKey)
  if (existing && existing.expires > now && existing.owner !== input.owner) {
    return { ok: false, reason: 'Lock held by another worker.' }
  }
  memoryLocks.set(input.lockKey, { owner: input.owner, expires: now + ttl * 1000 })

  try {
    const admin = createAdminClient()
    const expiresAt = new Date(now + ttl * 1000).toISOString()
    // Clear expired
    await admin
      .from('jarvis_execution_locks')
      .delete()
      .lt('expires_at', new Date().toISOString())

    const { data: row } = await admin
      .from('jarvis_execution_locks')
      .select('id, owner')
      .eq('lock_key', input.lockKey)
      .maybeSingle()

    if (row && row.owner !== input.owner) {
      memoryLocks.delete(input.lockKey)
      return { ok: false, reason: 'Database lock held by another worker.' }
    }

    if (row) {
      await admin
        .from('jarvis_execution_locks')
        .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq('lock_key', input.lockKey)
    } else {
      const { error } = await admin.from('jarvis_execution_locks').insert({
        lock_key: input.lockKey,
        owner: input.owner,
        expires_at: expiresAt,
      })
      if (error && !/duplicate|unique/i.test(error.message)) {
        // table missing — memory lock only
      }
      if (error && /duplicate|unique/i.test(error.message)) {
        memoryLocks.delete(input.lockKey)
        return { ok: false, reason: 'Database lock race — another worker won.' }
      }
    }
  } catch {
    // ephemeral memory lock only
  }

  return { ok: true }
}

export async function releaseExecutionLock(lockKey: string, owner: string): Promise<void> {
  const existing = memoryLocks.get(lockKey)
  if (existing?.owner === owner) memoryLocks.delete(lockKey)
  try {
    const admin = createAdminClient()
    await admin.from('jarvis_execution_locks').delete().eq('lock_key', lockKey).eq('owner', owner)
  } catch {
    /* ignore */
  }
}
