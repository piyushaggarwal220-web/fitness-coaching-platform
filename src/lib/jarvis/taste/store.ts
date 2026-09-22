/**
 * Taste preference store — durable evidence + preferences.
 * Confirmed/ACTIVE USER_TASTE syncs to jarvis_memory for Phase 3 retrieval.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { remember } from '@/lib/jarvis/memory/business-memory'
import {
  applyEvidenceWeight,
  clampConfidence,
  oppositePolarity,
  resolveStatus,
  decayConfidence,
  STALE_DAYS,
} from '@/lib/jarvis/taste/confidence'
import type {
  TasteEvidence,
  TasteEvidenceType,
  TastePreference,
  TasteProfile,
  TasteSignal,
  TasteSignalKind,
  TasteScope,
} from '@/lib/jarvis/taste/types'

export function preferenceFingerprint(input: {
  scope: TasteScope
  scope_id?: string | null
  dimension: string
  preference_key: string
  preference_value: string
  signal_kind?: TasteSignalKind
}): string {
  const raw = [
    input.signal_kind || 'USER_TASTE',
    input.scope,
    input.scope_id || '',
    input.dimension,
    input.preference_key,
    input.preference_value,
  ].join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

export function evidenceFingerprint(input: {
  evidence_type: string
  preference_key: string
  signal: string
  edl_id?: string | null
  edl_version?: number | null
  feedback_text?: string | null
  render_job_id?: string | null
  creative_content_id?: string | null
}): string {
  const raw = [
    input.evidence_type,
    input.preference_key,
    input.signal,
    input.edl_id || '',
    String(input.edl_version ?? ''),
    (input.feedback_text || '').slice(0, 120),
    input.render_job_id || '',
    input.creative_content_id || '',
  ].join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 28)
}

function rowToPreference(row: Record<string, unknown>): TastePreference {
  return {
    id: row.id as string,
    scope: row.scope as TastePreference['scope'],
    scope_id: (row.scope_id as string) || null,
    dimension: row.dimension as TastePreference['dimension'],
    preference_key: row.preference_key as string,
    preference_value: row.preference_value as string,
    polarity: row.polarity as TastePreference['polarity'],
    influence_mode: row.influence_mode as TastePreference['influence_mode'],
    confidence: Number(row.confidence),
    evidence_count: Number(row.evidence_count || 0),
    positive_evidence_count: Number(row.positive_evidence_count || 0),
    negative_evidence_count: Number(row.negative_evidence_count || 0),
    source_types: (row.source_types as TasteEvidenceType[]) || [],
    status: row.status as TastePreference['status'],
    signal_kind: (row.signal_kind as TasteSignalKind) || 'USER_TASTE',
    explanation: (row.explanation as string) || null,
    first_observed_at: row.first_observed_at as string,
    last_observed_at: row.last_observed_at as string,
    confirmed_at: (row.confirmed_at as string) || null,
    rejected_at: (row.rejected_at as string) || null,
    memory_id: (row.memory_id as string) || null,
    fingerprint: row.fingerprint as string,
    history: (row.history as TastePreference['history']) || [],
  }
}

/**
 * Apply a taste signal into durable evidence + preference update.
 * Revision-only / skip_learning signals are recorded lightly or ignored.
 */
export async function ingestTasteSignal(
  signal: TasteSignal,
  meta?: {
    creative_content_id?: string | null
    edl_id?: string | null
    edl_version?: number | null
    render_job_id?: string | null
    actorId?: string | null
    feedback_text?: string | null
    diff_summary?: string | null
  }
): Promise<{
  ok: boolean
  preference_id: string | null
  evidence_id: string | null
  status: string
  confidence: number
  note: string
}> {
  if (signal.skip_learning || signal.is_revision_only) {
    return {
      ok: true,
      preference_id: null,
      evidence_id: null,
      status: 'skipped',
      confidence: 0,
      note: signal.note || 'Revision-only / skip — not written as durable preference.',
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const fp = preferenceFingerprint({
    scope: signal.scope,
    dimension: signal.dimension,
    preference_key: signal.preference_key,
    preference_value: signal.preference_value,
    signal_kind: 'USER_TASTE',
  })
  const efp = evidenceFingerprint({
    evidence_type: signal.evidence_type,
    preference_key: signal.preference_key,
    signal: signal.signal,
    edl_id: meta?.edl_id,
    edl_version: meta?.edl_version,
    feedback_text: meta?.feedback_text || signal.signal,
    render_job_id: meta?.render_job_id,
    creative_content_id: meta?.creative_content_id,
  })

  // Idempotent evidence
  const { data: existingEv } = await admin
    .from('jarvis_taste_evidence')
    .select('id, preference_id')
    .eq('fingerprint', efp)
    .maybeSingle()
  if (existingEv) {
    return {
      ok: true,
      preference_id: existingEv.preference_id,
      evidence_id: existingEv.id,
      status: 'idempotent',
      confidence: signal.confidence,
      note: 'Evidence already recorded (idempotent).',
    }
  }

  // Look for same key with opposite polarity → conflict
  const { data: sameKey } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .eq('dimension', signal.dimension)
    .eq('preference_key', signal.preference_key)
    .eq('signal_kind', 'USER_TASTE')
    .in('status', ['CANDIDATE', 'ACTIVE', 'CONFLICTED', 'STALE'])
    .limit(10)

  let conflicting = false
  for (const row of sameKey ?? []) {
    if (
      row.fingerprint !== fp &&
      oppositePolarity(row.polarity, signal.polarity)
    ) {
      conflicting = true
      const days =
        (Date.now() - new Date(row.last_observed_at).getTime()) / 86400_000
      const decayed = decayConfidence(Number(row.confidence), days)
      const applied = applyEvidenceWeight(decayed.confidence, signal.evidence_type, {
        conflicting: true,
      })
      await admin
        .from('jarvis_taste_preferences')
        .update({
          status: 'CONFLICTED',
          confidence: applied.confidence,
          negative_evidence_count: Number(row.negative_evidence_count || 0) + 1,
          evidence_count: Number(row.evidence_count || 0) + 1,
          last_observed_at: now,
          updated_at: now,
          explanation: `Conflict with ${signal.preference_value}: ${applied.reason}`,
          history: [
            ...((row.history as unknown[]) || []),
            {
              at: now,
              event: 'conflict',
              confidence_before: Number(row.confidence),
              confidence_after: applied.confidence,
              note: applied.reason,
            },
          ],
        })
        .eq('id', row.id)
    }
  }

  const { data: existingPref } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .eq('fingerprint', fp)
    .maybeSingle()

  let preferenceId: string
  let confidence: number
  let status: string

  if (existingPref) {
    const priorCount = Number(existingPref.evidence_count || 0)
    const reinforcing = priorCount >= 1
    const evidenceType: TasteEvidenceType =
      reinforcing && signal.evidence_type === 'EDL_REVISION'
        ? 'REPEATED_REVISION'
        : signal.evidence_type
    const applied = applyEvidenceWeight(Number(existingPref.confidence), evidenceType, {
      hard: signal.is_hard_constraint,
      reinforcing,
      conflicting,
    })
    confidence = applied.confidence
    const positive =
      Number(existingPref.positive_evidence_count || 0) +
      (signal.polarity === 'AVOID' || signal.direction === 'NEGATIVE' ? 0 : 1)
    const negative =
      Number(existingPref.negative_evidence_count || 0) +
      (signal.polarity === 'AVOID' || signal.direction === 'NEGATIVE' ? 1 : 0)
    const evidence_count = priorCount + 1
    const resolved = resolveStatus({
      confidence,
      evidence_count,
      positive,
      negative,
      current: existingPref.status,
    })
    status = resolved.status
    const sourceTypes = Array.from(
      new Set([...(existingPref.source_types || []), evidenceType])
    )
    await admin
      .from('jarvis_taste_preferences')
      .update({
        confidence,
        evidence_count,
        positive_evidence_count: positive,
        negative_evidence_count: negative,
        source_types: sourceTypes,
        status: resolved.status,
        influence_mode: signal.is_hard_constraint
          ? 'HARD_CONSTRAINT'
          : resolved.influence,
        last_observed_at: now,
        updated_at: now,
        explanation: `${signal.note}. ${applied.reason}. ${resolved.reason}`,
        history: [
          ...((existingPref.history as unknown[]) || []),
          {
            at: now,
            event: reinforcing ? 'strengthened' : 'evidence',
            confidence_before: Number(existingPref.confidence),
            confidence_after: confidence,
            note: applied.reason,
          },
        ],
      })
      .eq('id', existingPref.id)
    preferenceId = existingPref.id
  } else {
    confidence = clampConfidence(signal.confidence)
    const resolved = resolveStatus({
      confidence,
      evidence_count: 1,
      positive: 1,
      negative: 0,
      current: 'CANDIDATE',
    })
    status = resolved.status
    const { data: inserted, error } = await admin
      .from('jarvis_taste_preferences')
      .insert({
        scope: signal.scope,
        scope_id: null,
        dimension: signal.dimension,
        preference_key: signal.preference_key,
        preference_value: signal.preference_value,
        polarity: signal.polarity,
        influence_mode: signal.is_hard_constraint
          ? 'HARD_CONSTRAINT'
          : resolved.influence,
        confidence,
        evidence_count: 1,
        positive_evidence_count: 1,
        negative_evidence_count: 0,
        source_types: [signal.evidence_type],
        status: resolved.status,
        signal_kind: 'USER_TASTE',
        explanation: `${signal.note}. ${resolved.reason}`,
        fingerprint: fp,
        history: [
          {
            at: now,
            event: 'candidate_created',
            confidence_before: 0,
            confidence_after: confidence,
            note: signal.signal,
          },
        ],
      })
      .select('id')
      .single()
    if (error || !inserted) {
      return {
        ok: false,
        preference_id: null,
        evidence_id: null,
        status: 'failed',
        confidence: 0,
        note: error?.message || 'Failed to insert preference',
      }
    }
    preferenceId = inserted.id
  }

  const { data: ev, error: evErr } = await admin
    .from('jarvis_taste_evidence')
    .insert({
      preference_id: preferenceId,
      evidence_type:
        (existingPref && Number(existingPref.evidence_count) >= 1 && signal.evidence_type === 'EDL_REVISION'
          ? 'REPEATED_REVISION'
          : signal.evidence_type) as TasteEvidenceType,
      dimension: signal.dimension,
      preference_key: signal.preference_key,
      signal: signal.signal,
      direction: signal.direction,
      confidence: signal.confidence,
      signal_kind: 'USER_TASTE',
      scope: signal.scope,
      creative_content_id: meta?.creative_content_id || null,
      edl_id: meta?.edl_id || null,
      edl_version: meta?.edl_version ?? null,
      render_job_id: meta?.render_job_id || null,
      feedback_text: (meta?.feedback_text || '').slice(0, 500) || null,
      diff_summary: (meta?.diff_summary || '').slice(0, 500) || null,
      extracted: {
        preference_value: signal.preference_value,
        polarity: signal.polarity,
        is_hard_constraint: signal.is_hard_constraint,
      },
      fingerprint: efp,
      actor_id: meta?.actorId || null,
    })
    .select('id')
    .single()

  if (evErr) {
    return {
      ok: false,
      preference_id: preferenceId,
      evidence_id: null,
      status,
      confidence,
      note: evErr.message,
    }
  }

  // Sync ACTIVE hard/strong to jarvis_memory
  if (status === 'ACTIVE' || signal.is_hard_constraint) {
    await syncPreferenceToMemory(preferenceId)
  }

  return {
    ok: true,
    preference_id: preferenceId,
    evidence_id: ev?.id ?? null,
    status,
    confidence,
    note: `Taste updated (${status}, confidence ${confidence}).`,
  }
}

export async function ingestTasteSignals(
  signals: TasteSignal[],
  meta?: Parameters<typeof ingestTasteSignal>[1]
) {
  const results = []
  for (const s of signals) {
    results.push(await ingestTasteSignal(s, meta))
  }
  return results
}

async function syncPreferenceToMemory(preferenceId: string) {
  const admin = createAdminClient()
  const { data: pref } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .eq('id', preferenceId)
    .maybeSingle()
  if (!pref || pref.signal_kind !== 'USER_TASTE') return
  if (pref.status !== 'ACTIVE' && pref.influence_mode !== 'HARD_CONSTRAINT') return
  if (pref.memory_id) return

  const summary = `Taste: ${pref.dimension}.${pref.preference_key}=${pref.preference_value} (${pref.polarity}, confidence ${pref.confidence})`
  const row = await remember({
    category: pref.influence_mode === 'HARD_CONSTRAINT' ? 'business_rule' : 'preference',
    kind: pref.influence_mode === 'HARD_CONSTRAINT' ? 'OPERATING_RULE' : 'USER_PREFERENCE',
    title: `Taste · ${pref.dimension} · ${pref.preference_key}`,
    summary,
    confidence: pref.confidence >= 0.7 ? 'high' : pref.confidence >= 0.4 ? 'medium' : 'low',
    tags: ['preference', 'taste', pref.dimension.toLowerCase(), pref.preference_key],
    source: 'user_explicit',
    details: {
      memory_kind:
        pref.influence_mode === 'HARD_CONSTRAINT' ? 'OPERATING_RULE' : 'USER_PREFERENCE',
      taste_preference_id: pref.id,
      scope: pref.scope === 'GLOBAL' ? 'VIDEO_STYLE' : 'VIDEO_STYLE',
      evidence_label: 'REPEATED_PATTERN',
      confirmation: pref.confirmed_at ? 'explicit' : 'inferred_candidate',
    },
    scope: 'VIDEO_STYLE',
    memoryStatus: 'ACTIVE',
    sampleSize: pref.evidence_count,
  })
  await admin
    .from('jarvis_taste_preferences')
    .update({ memory_id: row.id, updated_at: new Date().toISOString() })
    .eq('id', preferenceId)
}

export async function confirmTastePreference(input: {
  preference_id: string
  scope?: TasteScope
  actorId?: string | null
}): Promise<{ ok: boolean; note: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: pref } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .eq('id', input.preference_id)
    .maybeSingle()
  if (!pref) return { ok: false, note: 'Preference not found' }

  await admin
    .from('jarvis_taste_preferences')
    .update({
      status: 'ACTIVE',
      confirmed_at: now,
      scope: input.scope || pref.scope,
      influence_mode:
        pref.influence_mode === 'HARD_CONSTRAINT'
          ? 'HARD_CONSTRAINT'
          : 'STRONG_PREFERENCE',
      confidence: clampConfidence(Math.max(Number(pref.confidence), 0.75)),
      updated_at: now,
      history: [
        ...((pref.history as unknown[]) || []),
        {
          at: now,
          event: 'confirmed',
          confidence_before: Number(pref.confidence),
          confidence_after: Math.max(Number(pref.confidence), 0.75),
          note: 'User confirmed standing preference',
        },
      ],
    })
    .eq('id', input.preference_id)

  await admin.from('jarvis_taste_evidence').insert({
    preference_id: input.preference_id,
    evidence_type: 'CONFIRMATION',
    dimension: pref.dimension,
    preference_key: pref.preference_key,
    signal: 'USER_CONFIRMED',
    direction: 'POSITIVE',
    confidence: 0.9,
    signal_kind: 'USER_TASTE',
    scope: input.scope || pref.scope,
    fingerprint: evidenceFingerprint({
      evidence_type: 'CONFIRMATION',
      preference_key: pref.preference_key,
      signal: `confirm:${input.preference_id}:${now}`,
    }),
    actor_id: input.actorId || null,
  })

  await syncPreferenceToMemory(input.preference_id)
  return { ok: true, note: 'Preference confirmed ACTIVE.' }
}

export async function rejectTastePreference(input: {
  preference_id: string
  actorId?: string | null
}): Promise<{ ok: boolean; note: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: pref } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .eq('id', input.preference_id)
    .maybeSingle()
  if (!pref) return { ok: false, note: 'Preference not found' }

  // Preserve evidence; mark rejected
  await admin
    .from('jarvis_taste_preferences')
    .update({
      status: 'REJECTED',
      rejected_at: now,
      influence_mode: 'OBSERVATION',
      updated_at: now,
      history: [
        ...((pref.history as unknown[]) || []),
        {
          at: now,
          event: 'rejected',
          confidence_before: Number(pref.confidence),
          confidence_after: Number(pref.confidence),
          note: 'User rejected preference; evidence preserved.',
        },
      ],
    })
    .eq('id', input.preference_id)

  if (pref.memory_id) {
    await admin
      .from('jarvis_memory')
      .update({ memory_status: 'SUPERSEDED', updated_at: now })
      .eq('id', pref.memory_id)
  }

  await admin.from('jarvis_taste_evidence').insert({
    preference_id: input.preference_id,
    evidence_type: 'REJECTION_OF_PREF',
    dimension: pref.dimension,
    preference_key: pref.preference_key,
    signal: 'USER_REJECTED_PREF',
    direction: 'NEGATIVE',
    confidence: 0.9,
    signal_kind: 'USER_TASTE',
    scope: pref.scope,
    fingerprint: evidenceFingerprint({
      evidence_type: 'REJECTION_OF_PREF',
      preference_key: pref.preference_key,
      signal: `reject:${input.preference_id}:${now}`,
    }),
    actor_id: input.actorId || null,
  })

  return { ok: true, note: 'Preference rejected; evidence trail preserved.' }
}

export async function listTastePreferences(opts?: {
  status?: string[]
  signal_kind?: TasteSignalKind
  limit?: number
}): Promise<TastePreference[]> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_taste_preferences')
    .select('*')
    .order('confidence', { ascending: false })
    .limit(opts?.limit ?? 50)
  if (opts?.status?.length) q = q.in('status', opts.status)
  if (opts?.signal_kind) q = q.eq('signal_kind', opts.signal_kind)
  const { data } = await q
  return (data ?? []).map((r) => rowToPreference(r))
}

export async function getTasteProfile(): Promise<TasteProfile> {
  const all = await listTastePreferences({ limit: 100 })
  const preferences = all.filter((p) => p.status === 'ACTIVE')
  const candidates = all.filter((p) => p.status === 'CANDIDATE')
  const conflicts = all.filter((p) => p.status === 'CONFLICTED')
  const confirmation_asks = candidates
    .filter((p) => p.confidence >= 0.55 && p.evidence_count >= 3 && p.signal_kind === 'USER_TASTE')
    .slice(0, 5)
    .map((p) => ({
      preference_id: p.id!,
      dimension: p.dimension,
      preference_key: p.preference_key,
      preference_value: p.preference_value,
      confidence: p.confidence,
      evidence_count: p.evidence_count,
      scope: p.scope,
      ask: `I've noticed you usually ${p.polarity.toLowerCase()} ${p.preference_key.replace(/_/g, ' ')} (${p.preference_value}) across ${p.evidence_count} editing events. Should I treat this as a standing preference${p.scope !== 'GLOBAL' ? ` for ${p.scope}` : ''}?`,
    }))

  const evidence_count = all.reduce((s, p) => s + p.evidence_count, 0)
  const last_updated =
    all.map((p) => p.last_observed_at).sort().reverse()[0] || null

  return {
    preferences,
    candidates,
    conflicts,
    confirmation_asks,
    evidence_count,
    last_updated,
  }
}

export async function listEvidenceForPreference(
  preferenceId: string,
  limit = 20
): Promise<TasteEvidence[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_taste_evidence')
    .select('*')
    .eq('preference_id', preferenceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((row) => ({
    id: row.id,
    preference_id: row.preference_id,
    evidence_type: row.evidence_type,
    dimension: row.dimension,
    preference_key: row.preference_key,
    signal: row.signal,
    direction: row.direction,
    confidence: Number(row.confidence),
    signal_kind: row.signal_kind,
    scope: row.scope,
    scope_id: row.scope_id,
    creative_content_id: row.creative_content_id,
    edl_id: row.edl_id,
    edl_version: row.edl_version,
    render_job_id: row.render_job_id,
    feedback_text: row.feedback_text,
    diff_summary: row.diff_summary,
    extracted: (row.extracted as Record<string, unknown>) || {},
    fingerprint: row.fingerprint,
    created_at: row.created_at,
  }))
}

export async function markStaleTastePreferences(max = 20): Promise<{ marked: number }> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString()
  const { data } = await admin
    .from('jarvis_taste_preferences')
    .select('*')
    .in('status', ['CANDIDATE', 'ACTIVE'])
    .lt('last_observed_at', cutoff)
    .limit(max)

  let marked = 0
  for (const row of data ?? []) {
    const days =
      (Date.now() - new Date(row.last_observed_at).getTime()) / 86400_000
    const decayed = decayConfidence(Number(row.confidence), days)
    const resolved = resolveStatus({
      confidence: decayed.confidence,
      evidence_count: Number(row.evidence_count),
      positive: Number(row.positive_evidence_count),
      negative: Number(row.negative_evidence_count),
      current: row.status,
      days_since_last: days,
    })
    await admin
      .from('jarvis_taste_preferences')
      .update({
        confidence: decayed.confidence,
        status: resolved.status === 'STALE' ? 'STALE' : row.status,
        influence_mode: resolved.influence,
        updated_at: new Date().toISOString(),
        explanation: `${row.explanation || ''} ${decayed.reason}`.trim(),
      })
      .eq('id', row.id)
    if (resolved.status === 'STALE') marked += 1
  }
  return { marked }
}

/** Pure helper for tests — apply signal onto an in-memory preference map. */
export function applySignalInMemory(
  prefs: Map<string, TastePreference>,
  signal: TasteSignal
): TastePreference | null {
  if (signal.skip_learning || signal.is_revision_only) return null
  const fp = preferenceFingerprint({
    scope: signal.scope,
    dimension: signal.dimension,
    preference_key: signal.preference_key,
    preference_value: signal.preference_value,
  })
  const now = new Date().toISOString()
  const existing = prefs.get(fp)
  if (!existing) {
    const confidence = clampConfidence(signal.confidence)
    const resolved = resolveStatus({
      confidence,
      evidence_count: 1,
      positive: 1,
      negative: 0,
      current: 'CANDIDATE',
    })
    const pref: TastePreference = {
      id: fp,
      scope: signal.scope,
      scope_id: null,
      dimension: signal.dimension,
      preference_key: signal.preference_key,
      preference_value: signal.preference_value,
      polarity: signal.polarity,
      influence_mode: signal.is_hard_constraint ? 'HARD_CONSTRAINT' : resolved.influence,
      confidence,
      evidence_count: 1,
      positive_evidence_count: 1,
      negative_evidence_count: 0,
      source_types: [signal.evidence_type],
      status: resolved.status,
      signal_kind: 'USER_TASTE',
      explanation: signal.note,
      first_observed_at: now,
      last_observed_at: now,
      confirmed_at: null,
      rejected_at: null,
      memory_id: null,
      fingerprint: fp,
      history: [
        {
          at: now,
          event: 'candidate_created',
          confidence_before: 0,
          confidence_after: confidence,
          note: signal.signal,
        },
      ],
    }
    prefs.set(fp, pref)
    return pref
  }

  const reinforcing = existing.evidence_count >= 1
  const type: TasteEvidenceType =
    reinforcing && signal.evidence_type === 'EDL_REVISION'
      ? 'REPEATED_REVISION'
      : signal.evidence_type
  const applied = applyEvidenceWeight(existing.confidence, type, {
    hard: signal.is_hard_constraint,
    reinforcing,
  })
  existing.confidence = applied.confidence
  existing.evidence_count += 1
  existing.positive_evidence_count += 1
  existing.source_types = Array.from(new Set([...existing.source_types, type]))
  existing.last_observed_at = now
  const resolved = resolveStatus({
    confidence: existing.confidence,
    evidence_count: existing.evidence_count,
    positive: existing.positive_evidence_count,
    negative: existing.negative_evidence_count,
    current: existing.status,
  })
  existing.status = resolved.status
  existing.influence_mode = signal.is_hard_constraint
    ? 'HARD_CONSTRAINT'
    : resolved.influence
  const before = existing.history.length
    ? existing.history[existing.history.length - 1].confidence_after
    : signal.confidence
  existing.history.push({
    at: now,
    event: reinforcing ? 'strengthened' : 'evidence',
    confidence_before: before,
    confidence_after: existing.confidence,
    note: applied.reason,
  })
  return existing
}
