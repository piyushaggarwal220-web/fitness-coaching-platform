/**
 * Generate complete Instagram video drafts/scripts from a selected content idea.
 * Never publishes. Approval-gated publishing remains separate.
 */

import { z } from 'zod'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import {
  getLocalInstagramContentById,
  saveInstagramDraft,
  updateInstagramDraft,
} from '@/lib/jarvis/instagram/content-store'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'
import type { InstagramContentPlan } from '@/lib/jarvis/instagram/types'

const draftSchema = z.object({
  hook: z.string().min(2).max(280),
  spoken_script: z.string().min(20).max(5000),
  scenes: z
    .array(
      z.object({
        scene: z.number().int().min(1).max(20),
        duration_sec: z.number().min(1).max(30),
        visual: z.string().min(5).max(500),
        spoken: z.string().min(0).max(800),
        on_screen_text: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(12),
  shot_list: z.array(z.string().min(3).max(300)).min(1).max(20),
  on_screen_text: z.array(z.string().min(1).max(120)).max(12).default([]),
  subtitle_guidance: z.string().min(10).max(1000),
  caption: z.string().min(5).max(2200),
  cta: z.string().min(2).max(120),
  hashtags: z.array(z.string().max(60)).max(8).default([]),
  hashtag_justification: z.string().max(400).optional(),
  estimated_duration_sec: z.number().int().min(7).max(60),
  aspect_ratio: z.enum(['9:16', '1:1', '4:5']).default('9:16'),
  b_roll_suggestions: z.array(z.string().min(3).max(300)).max(12).default([]),
  editing_instructions: z.string().min(20).max(3000),
  reel_concept: z.string().min(10).max(4000),
})

export type InstagramVideoDraft = z.infer<typeof draftSchema>

function ideaFromContent(row: NonNullable<Awaited<ReturnType<typeof getLocalInstagramContentById>>['value']>): Partial<InstagramContentPlan> {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  return {
    topic: row.topic || undefined,
    hook: row.hook || undefined,
    format: (row.content_type as InstagramContentPlan['format']) || 'reel',
    reel_concept: typeof meta.reel_concept === 'string' ? meta.reel_concept : undefined,
    caption: row.caption || undefined,
    cta: typeof meta.cta === 'string' ? meta.cta : undefined,
    target_audience: typeof meta.target_audience === 'string' ? meta.target_audience : undefined,
    objective: typeof meta.objective === 'string' ? meta.objective : undefined,
    sourced_facts: Array.isArray(meta.sourced_facts) ? meta.sourced_facts.map(String) : [],
    jarvis_inference: Array.isArray(meta.jarvis_inference) ? meta.jarvis_inference.map(String) : [],
    jarvis_recommendation: Array.isArray(meta.jarvis_recommendation)
      ? meta.jarvis_recommendation.map(String)
      : [],
  }
}

export async function generateInstagramDraft(input: {
  content_id?: string
  idea?: Partial<InstagramContentPlan> & {
    concept?: string
    caption_angle?: string
    visual_structure?: string
    estimated_duration_sec?: number
    suggested_aspect_ratio?: string
  }
  actorId?: string | null
  save?: boolean
}): Promise<{
  ok: boolean
  data_status: 'verified' | 'failed' | 'unavailable'
  source: string
  retrieved_at: string
  draft: InstagramVideoDraft | null
  content_id: string | null
  note: string
  error?: string
  published: false
}> {
  const retrieved_at = new Date().toISOString()
  const gate = await assertAiBudgetAvailable(0.18)
  if (!gate.ok) {
    return {
      ok: false,
      data_status: 'unavailable',
      source: 'instagram.generate_draft',
      retrieved_at,
      draft: null,
      content_id: input.content_id ?? null,
      note: gate.reason,
      error: gate.reason,
      published: false,
    }
  }

  try {
    let idea = input.idea ?? null
    let contentId = input.content_id ?? null

    if (contentId) {
      const existing = await getLocalInstagramContentById(contentId)
      if (!existing.ok || !existing.value) {
        return {
          ok: false,
          data_status: 'failed',
          source: 'instagram.generate_draft',
          retrieved_at,
          draft: null,
          content_id: contentId,
          note: 'Content idea not found.',
          error: existing.error || 'not_found',
          published: false,
        }
      }
      idea = { ...ideaFromContent(existing.value), ...idea }
    }

    if (!idea) {
      return {
        ok: false,
        data_status: 'failed',
        source: 'instagram.generate_draft',
        retrieved_at,
        draft: null,
        content_id: null,
        note: 'Provide content_id or idea.',
        error: 'missing_idea',
        published: false,
      }
    }

    const { data } = await generateMarketingJson({
      systemPrompt: `You are the LURVOX Instagram draft writer for Jarvis.
Produce a complete short-form video draft.
Defaults: aspect_ratio 9:16, duration 7–60 seconds.
Include spoken script, scene-by-scene structure, shot list, on-screen text, subtitle guidance, caption, CTA, B-roll, editing instructions.
Hashtags only when justified (explain why). Never claim the draft is published. Never invent performance guarantees.`,
      userPrompt: JSON.stringify({
        idea,
        defaults: { aspect_ratio: '9:16', duration_range_sec: [7, 60] },
      }),
      schema: draftSchema,
      maxTokens: 5000,
    })

    await recordCostUsage({
      category: 'tool',
      toolName: 'instagram.generate_draft',
      costUsd: 0.18,
      metadata: { content_id: contentId },
    })

    let savedId = contentId
    if (input.save !== false) {
      if (contentId) {
        const updated = await updateInstagramDraft({
          contentId,
          patch: {
            status: 'draft',
            caption: data.caption,
            hook: data.hook,
            metadata: {
              draft_v2: true,
              spoken_script: data.spoken_script,
              scenes: data.scenes,
              shot_list: data.shot_list,
              on_screen_text: data.on_screen_text,
              subtitle_guidance: data.subtitle_guidance,
              cta: data.cta,
              hashtags: data.hashtags,
              hashtag_justification: data.hashtag_justification ?? null,
              estimated_duration_sec: data.estimated_duration_sec,
              aspect_ratio: data.aspect_ratio,
              b_roll_suggestions: data.b_roll_suggestions,
              editing_instructions: data.editing_instructions,
              reel_concept: data.reel_concept,
            },
          },
          actorId: input.actorId,
        })
        if (!updated.ok) {
          return {
            ok: false,
            data_status: 'failed',
            source: 'instagram.generate_draft',
            retrieved_at,
            draft: data,
            content_id: contentId,
            note: 'Draft generated but save failed.',
            error: updated.error,
            published: false,
          }
        }
      } else {
        const plan: InstagramContentPlan = {
          topic: idea.topic || 'Draft topic',
          hook: data.hook,
          format: idea.format || 'reel',
          reel_concept: data.reel_concept,
          caption: data.caption,
          cta: data.cta,
          target_audience: idea.target_audience || 'Fitness audience',
          objective: idea.objective || 'engagement',
          suggested_publishing_window: idea.suggested_publishing_window || 'weekday evening IST',
          research_references: idea.research_references ?? [],
          sourced_facts: idea.sourced_facts ?? [],
          jarvis_inference: idea.jarvis_inference ?? [],
          jarvis_recommendation: idea.jarvis_recommendation ?? [],
        }
        const saved = await saveInstagramDraft({
          plan,
          actorId: input.actorId,
          extraMetadata: {
            draft_v2: true,
            spoken_script: data.spoken_script,
            scenes: data.scenes,
            shot_list: data.shot_list,
            on_screen_text: data.on_screen_text,
            subtitle_guidance: data.subtitle_guidance,
            hashtags: data.hashtags,
            hashtag_justification: data.hashtag_justification ?? null,
            estimated_duration_sec: data.estimated_duration_sec,
            aspect_ratio: data.aspect_ratio,
            b_roll_suggestions: data.b_roll_suggestions,
            editing_instructions: data.editing_instructions,
          },
        })
        savedId = saved.content_id ?? null
      }
    }

    await writeInstagramAudit({
      action: 'instagram.generate_draft',
      target: savedId,
      actor: input.actorId ?? 'jarvis',
      approval_state: null,
      result: 'ok',
      provider_response_status: null,
      extra: { content_id: savedId, published: false },
    })

    return {
      ok: true,
      data_status: 'verified',
      source: 'instagram.generate_draft',
      retrieved_at,
      draft: data,
      content_id: savedId,
      note: 'Draft generated. Not published. Instagram publishing remains approval-gated and disabled unless LIVE_INSTAGRAM_PUBLISHING_ENABLED=true.',
      published: false,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await writeInstagramAudit({
      action: 'instagram.generate_draft',
      target: input.content_id ?? null,
      actor: input.actorId ?? 'jarvis',
      approval_state: null,
      result: 'failed',
      provider_response_status: null,
      error_redacted: error,
    })
    return {
      ok: false,
      data_status: 'failed',
      source: 'instagram.generate_draft',
      retrieved_at,
      draft: null,
      content_id: input.content_id ?? null,
      note: 'Draft generation failed.',
      error,
      published: false,
    }
  }
}
