/**
 * Phase 5 edit_handoff / creative plan → canonical EDL.
 * Never invents source timestamps.
 */

import { createHash, randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EditHandoffPayload, CreativePlan } from '@/lib/jarvis/creative/types'
import { loadCreativeById } from '@/lib/jarvis/creative/store'
import { buildCaptions } from '@/lib/jarvis/video/editor/captions'
import { buildOverlays } from '@/lib/jarvis/video/editor/overlays'
import { centerCropReframe, smartFaceReframeCapability } from '@/lib/jarvis/video/editor/reframe'
import { defaultEdlAudio } from '@/lib/jarvis/video/editor/audio'
import { clampTargetDurationSec } from '@/lib/jarvis/video/editor/duration'
import { estimateEdlRenderCostUsd } from '@/lib/jarvis/video/editor/cost'
import {
  SHORT_FORM_FITNESS_REEL_OUTPUT,
  ms,
  purposeFromRole,
  type EditDecisionList,
  type SourceManifestEntry,
  type TimelineClip,
} from '@/lib/jarvis/video/editor/types'

function fingerprintEdl(parts: string): string {
  return createHash('sha256').update(parts).digest('hex').slice(0, 24)
}

async function resolveSources(
  sourceIds: string[]
): Promise<Map<string, { source_ref: string; filename: string | null; duration_sec: number | null }>> {
  const map = new Map<
    string,
    { source_ref: string; filename: string | null; duration_sec: number | null }
  >()
  if (!sourceIds.length) return map
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_video_sources')
    .select('id, source_ref, original_filename, duration_sec')
    .in('id', sourceIds)
  for (const row of data ?? []) {
    map.set(row.id, {
      source_ref: row.source_ref,
      filename: row.original_filename,
      duration_sec: row.duration_sec != null ? Number(row.duration_sec) : null,
    })
  }
  return map
}

export function planEdlFromHandoffSync(input: {
  handoff: EditHandoffPayload
  creative?: Partial<CreativePlan> | null
  creative_content_id?: string | null
  creative_version?: number | null
  session_id?: string | null
  sourceLookup?: Map<
    string,
    { source_ref: string; filename: string | null; duration_sec: number | null }
  >
}): EditDecisionList {
  const handoff = input.handoff
  const crop = centerCropReframe()
  const face = smartFaceReframeCapability()
  const warnings: string[] = []
  const unsupported = [
    {
      feature: 'smart_face_reframe',
      status: face.capability,
      note: face.note,
    },
  ]

  const timeline: TimelineClip[] = []
  let cursor = 0
  const missingSegments: string[] = [...(handoff.new_recording_segments || [])]

  const sequence = handoff.sequence?.length
    ? handoff.sequence
    : handoff.source_segments.map((s, i) => ({
        role: s.role || (i === 0 ? 'HOOK' : 'BODY'),
        kind: 'SPOKEN_FOOTAGE' as const,
        source: s,
        text: '',
      }))

  for (const beat of sequence) {
    if (beat.kind === 'NEW_RECORDING_REQUIRED' || beat.kind === 'BROLL_REQUIRED') {
      missingSegments.push(`${beat.role}: ${beat.text.slice(0, 80)}`)
      const placeholderLen = 3000
      timeline.push({
        id: randomUUID(),
        source_ref: null,
        source_id: null,
        source_start_ms: 0,
        source_end_ms: 0,
        timeline_start_ms: cursor,
        timeline_end_ms: cursor + placeholderLen,
        trim: null,
        crop: { strategy: 'center_crop', note: crop.note },
        scale: 1,
        position: 'center',
        volume: 1,
        playback_rate: 1,
        transition_in: 'CUT',
        transition_out: 'CUT',
        purpose: purposeFromRole(beat.role),
        provenance: `phase5:${beat.kind}`,
        missing: true,
        missing_reason: 'NEW_RECORDING_REQUIRED',
      })
      cursor += placeholderLen
      continue
    }

    const src = beat.source
    if (!src || !(src.end > src.start) || !src.source_id) {
      warnings.push(`Beat ${beat.role} missing valid source timestamps — not invented`)
      missingSegments.push(`Missing timestamps for ${beat.role}`)
      continue
    }

    const startMs = ms(src.start)
    const endMs = ms(src.end)
    if (!(endMs > startMs)) {
      warnings.push(`Invalid range for ${beat.role}: ${src.start}-${src.end}`)
      continue
    }

    const looked = input.sourceLookup?.get(src.source_id)
    const len = endMs - startMs
    const clip: TimelineClip = {
      id: randomUUID(),
      source_ref: looked?.source_ref ?? null,
      source_id: src.source_id,
      source_start_ms: startMs,
      source_end_ms: endMs,
      timeline_start_ms: cursor,
      timeline_end_ms: cursor + len,
      trim: { start_ms: startMs, end_ms: endMs },
      crop: { strategy: 'center_crop', note: crop.note },
      scale: 1,
      position: 'center',
      volume: 1,
      playback_rate: 1,
      transition_in: 'CUT',
      transition_out: 'CUT',
      purpose: purposeFromRole(beat.role || src.role || 'BODY'),
      provenance: `phase5_source_mapping:${src.source_id}:${src.start}-${src.end}`,
    }
    timeline.push(clip)
    cursor += len
  }

  // Prefer coherent story over padding — do not invent filler clips
  const estimated_duration_ms = timeline
    .filter((c) => !c.missing)
    .reduce((s, c) => s + (c.timeline_end_ms - c.timeline_start_ms), 0)

  const targetSec = clampTargetDurationSec(
    input.creative?.target_duration_sec ?? handoff.duration ?? null
  )

  const hookEnd =
    timeline.find((c) => c.purpose === 'HOOK' && !c.missing)?.timeline_end_ms ?? 2200

  const overlays = buildOverlays({
    hookText: input.creative?.hook?.text || handoff.overlays?.[0] || null,
    ctaText: handoff.cta,
    emphasis: (handoff.overlays || []).slice(1, 3),
    hookEndMs: hookEnd,
    timelineEndMs: Math.max(estimated_duration_ms, cursor),
    reduce: false,
  })

  // Script-derived captions from overlays — NOT transcript-derived unless we have timestamps
  const captions = buildCaptions({
    lines: overlays.map((o) => ({
      text: o.text,
      start_ms: o.start_ms,
      end_ms: o.end_ms,
      provenance: 'SCRIPT_DERIVED' as const,
    })),
  })

  const manifest: SourceManifestEntry[] = []
  const seen = new Set<string>()
  for (const c of timeline) {
    if (!c.source_id || seen.has(c.source_id)) continue
    seen.add(c.source_id)
    const looked = input.sourceLookup?.get(c.source_id)
    manifest.push({
      source_id: c.source_id,
      source_ref: looked?.source_ref || c.source_ref || '',
      filename: looked?.filename ?? null,
      duration_ms: looked?.duration_sec != null ? ms(looked.duration_sec) : null,
    })
  }

  if (missingSegments.length) {
    warnings.push(`NEW_RECORDING_REQUIRED: ${missingSegments.slice(0, 5).join('; ')}`)
  }

  const fp = fingerprintEdl(
    [
      input.creative_content_id || '',
      ...timeline
        .filter((c) => !c.missing)
        .map((c) => `${c.source_id}:${c.source_start_ms}-${c.source_end_ms}:${c.purpose}`),
    ].join('|')
  )

  const hasMissing = timeline.some((c) => c.missing) || missingSegments.length > 0
  const hasClips = timeline.some((c) => !c.missing)

  return {
    id: null,
    creative_content_id: input.creative_content_id ?? handoff.creative_id ?? null,
    creative_version: input.creative_version ?? null,
    session_id: input.session_id ?? null,
    version: 1,
    parent_edl_id: null,
    title: input.creative?.title || 'Fitness Reel',
    objective: input.creative?.objective || null,
    platform: input.creative?.platform || 'instagram',
    format: 'reel',
    aspect_ratio: '9:16',
    target_duration_ms: targetSec != null ? ms(targetSec) : null,
    timeline,
    audio: defaultEdlAudio(),
    captions,
    overlays,
    transitions: ['CUT'],
    output: SHORT_FORM_FITNESS_REEL_OUTPUT,
    source_manifest: manifest,
    warnings,
    unsupported_features: unsupported,
    estimated_render_cost_usd: estimateEdlRenderCostUsd(estimated_duration_ms || 15000),
    estimated_duration_ms: estimated_duration_ms || 0,
    status: !hasClips && hasMissing ? 'MISSING_FOOTAGE' : hasMissing ? 'DRAFT' : 'DRAFT',
    fingerprint: fp,
    revision_reason: null,
    user_feedback: null,
    changed_operations: [],
    provider_agnostic: true,
  }
}

export async function createEdlFromCreative(input: {
  creative_id: string
  actorId?: string | null
  force_new?: boolean
}): Promise<{
  ok: boolean
  edl: EditDecisionList | null
  status: string
  note: string
}> {
  const loaded = await loadCreativeById(input.creative_id)
  if (!loaded?.plan?.edit_handoff) {
    return {
      ok: false,
      edl: null,
      status: 'failed',
      note: 'Creative plan or edit_handoff not found',
    }
  }

  const handoff = loaded.plan.edit_handoff
  const sourceIds = [
    ...new Set(
      [
        ...handoff.source_segments.map((s) => s.source_id),
        ...handoff.sequence
          .map((b) => b.source?.source_id)
          .filter((x): x is string => Boolean(x)),
      ].filter(Boolean)
    ),
  ]
  const lookup = await resolveSources(sourceIds)
  const edl = planEdlFromHandoffSync({
    handoff,
    creative: loaded.plan,
    creative_content_id: loaded.id,
    creative_version: loaded.version,
    session_id: loaded.video_session_id,
    sourceLookup: lookup,
  })

  // Fill source_ref when lookup worked
  for (const clip of edl.timeline) {
    if (clip.source_id && !clip.source_ref) {
      clip.source_ref = lookup.get(clip.source_id)?.source_ref ?? null
    }
  }

  // Phase 7: apply relevant USER_TASTE (soft). Explicit dramatic-zoom instruction wins.
  let finalEdl = edl
  const tasteApplied: string[] = []
  try {
    const { retrieveTaste, effectsFromRetrievedTaste, applyTasteToEdl } = await import(
      '@/lib/jarvis/taste'
    )
    const instr = loaded.plan.current_instruction_override || ''
    const dramatic = /dramatic zoom|add (?:a )?zoom/i.test(instr)
    const taste = await retrieveTaste({
      platform: loaded.plan.platform,
      objective: loaded.plan.objective,
      pillar: loaded.plan.pillar,
      funnel_id: loaded.plan.funnel_id,
      current_instruction: instr,
      format: loaded.plan.format,
    })
    const effects = effectsFromRetrievedTaste(taste)
    // Prefer creative plan flags if already set from Phase 5 taste-aware planning
    if (loaded.plan.taste_influences?.some((t) => t.preference_key === 'zoom_frequency')) {
      effects.minimal_zooms = true
    }
    const applied = applyTasteToEdl(edl, effects, { dramatic_zoom_requested: dramatic })
    finalEdl = applied.edl
    tasteApplied.push(...applied.applied)
  } catch {
    // Taste optional
  }

  return {
    ok: true,
    edl: finalEdl,
    status: finalEdl.status,
    note: finalEdl.timeline.some((c) => c.missing)
      ? 'EDL drafted with NEW_RECORDING_REQUIRED segments — do not render until resolved.'
      : tasteApplied.length
        ? `EDL drafted with taste applied: ${tasteApplied.join('; ')}. Validate before render.`
        : 'EDL drafted from Phase 5 handoff. Validate before render.',
  }
}
