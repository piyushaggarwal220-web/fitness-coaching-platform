import { getBrandContext } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { ugcBatchSchema } from '@/lib/ai-marketing/validation/schemas'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export interface UgcVideoProvider {
  name: string
  generateVideo?(input: Record<string, unknown>): Promise<{ jobId: string; status: string }>
}

export class StubUgcProvider implements UgcVideoProvider {
  name = 'stub'
  async generateVideo(input: Record<string, unknown>) {
    return { jobId: `stub-${Date.now()}`, status: 'not_configured', ...{ input } }
  }
}

export function getUgcProvider(): UgcVideoProvider {
  // Future: HeyGen / Creatify / custom — selected via UGC_VIDEO_PROVIDER env
  return new StubUgcProvider()
}

export async function generateUgcConcepts(input: {
  count: number
  personaHint?: string
  painPoint?: string
  actorId?: string | null
}) {
  const brand = await getBrandContext()
  const admin = createAdminClient()
  const count = Math.min(20, Math.max(1, input.count))

  const systemPrompt = `You are the LURVOX UGC Agent.
Produce scripted advertisement / AI-presenter UGC concepts.
CRITICAL:
- NEVER fabricate real customer testimonials or fake names of real people.
- Set content_label correctly:
  - ai_generated_presenter
  - scripted_advertisement
  - real_customer_testimonial (ONLY if explicitly provided as real — otherwise never)
- Include a clear disclaimer on every concept.`

  const { data } = await generateMarketingJson({
    systemPrompt,
    userPrompt: JSON.stringify({
      count,
      brand,
      persona_hint: input.personaHint,
      pain_point: input.painPoint,
    }),
    schema: ugcBatchSchema,
    maxTokens: 7000,
  })

  const saved: string[] = []
  for (const concept of data.concepts.slice(0, count)) {
    // Force-safe label if model tries to claim real testimonial without source
    const label =
      concept.content_label === 'real_customer_testimonial'
        ? 'scripted_advertisement'
        : concept.content_label

    const { data: row } = await admin
      .from('marketing_creatives')
      .insert({
        name: concept.ugc_concept,
        type: 'ugc',
        concept: concept.ugc_concept,
        angle: 'ugc',
        hook: concept.hook,
        headline: concept.ugc_concept,
        primary_text: concept.script,
        description: concept.caption,
        cta: concept.cta,
        visual_direction: concept.visual_instructions,
        target_audience: concept.target_persona,
        hypothesis: `UGC angle for ${concept.target_persona}`,
        expected_test_reason: 'Test UGC creative format vs static',
        status: 'generated',
        source: 'ai',
        labels: [label, 'ai_ugc'],
        metadata: {
          scenes: concept.scenes,
          voice_instructions: concept.voice_instructions,
          disclaimer: concept.disclaimer,
          content_label: label,
          provider: getUgcProvider().name,
        },
        created_by: input.actorId ?? null,
      })
      .select('id')
      .maybeSingle()
    if (row?.id) saved.push(row.id)
  }

  await writeMarketingAudit({
    agent: 'ugc',
    decision: 'generated_ugc',
    reasoning: `Generated ${saved.length} UGC concepts (provider=${getUgcProvider().name})`,
    action: 'CREATE_NEW_CREATIVE',
    actor_id: input.actorId ?? null,
    execution_result: { creative_ids: saved },
  })

  return { concepts: data.concepts, creativeIds: saved }
}
