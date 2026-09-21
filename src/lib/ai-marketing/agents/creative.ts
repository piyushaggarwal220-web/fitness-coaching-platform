import { CREATIVE_ANGLES, type CreativeConcept } from '@/lib/ai-marketing/types'
import { getBrandContext } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { creativeBatchSchema } from '@/lib/ai-marketing/validation/schemas'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImageProvider } from '@/lib/ai-marketing/openai/image-provider'
import { getFunnelById } from '@/lib/ai-marketing/funnels'

export type GenerateCreativesInput = {
  count: 5 | 10 | 20 | 50
  funnelId: string
  productId?: string
  audienceHint?: string
  offerHint?: string
  parentCreativeId?: string
  variationMode?: boolean
  actorId?: string | null
  generateImages?: boolean
}

export async function generateCreativeConcepts(
  input: GenerateCreativesInput
): Promise<{ concepts: CreativeConcept[]; jobId: string | null }> {
  const brand = await getBrandContext()
  const funnel = await getFunnelById(input.funnelId)
  if (!funnel) throw new Error('funnelId is required and must be a valid marketing funnel')

  const admin = createAdminClient()

  const { data: job } = await admin
    .from('marketing_generation_jobs')
    .insert({
      job_type: input.variationMode ? 'creative_variations' : 'static_creatives',
      status: 'processing',
      input: input,
      funnel_id: funnel.id,
      created_by: input.actorId ?? null,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const { data: recentCreatives } = await admin
    .from('marketing_creatives')
    .select('name, angle, hook, headline, status')
    .eq('funnel_id', funnel.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: perf } = await admin
    .from('marketing_performance')
    .select('spend, purchases, revenue, ctr, cpa, roas, meta_ad_id')
    .eq('funnel_id', funnel.id)
    .order('date', { ascending: false })
    .limit(50)

  let parent: Record<string, unknown> | null = null
  if (input.parentCreativeId) {
    const { data } = await admin
      .from('marketing_creatives')
      .select('*')
      .eq('id', input.parentCreativeId)
      .maybeSingle()
    parent = data
  }

  const priceStrategies =
    funnel.price_inr <= 200
      ? 'Prefer low-price, simplicity, impulse, immediate-value angles — but only as hypotheses until proven by this funnel\'s data.'
      : 'Prefer transformation, trust, authority, proof, detailed benefits, objection handling — but only as hypotheses until proven by this funnel\'s data.'

  const systemPrompt = `You are the LURVOX Creative Agent for ONE funnel: ${funnel.name} (₹${funnel.price_inr}).
Generate DISTINCT ad concepts for THIS funnel only — do not reuse another funnel's strategy assumptions.
${priceStrategies}
Angles to diversify across: ${CREATIVE_ANGLES.join(', ')}.
Rules:
- Do NOT claim unverified performance results.
- Do NOT invent fake testimonials or customer names.
- Do NOT assume ₹99 and ₹1,699 share the same winning angles.
- CTAs should fit Meta ads.
- Image prompts must be concrete, brand-safe.`

  const userPrompt = JSON.stringify({
    count: input.count,
    brand,
    funnel: {
      id: funnel.id,
      slug: funnel.slug,
      name: funnel.name,
      offer: funnel.offer,
      product: funnel.product,
      price_inr: funnel.price_inr,
      target_audience: funnel.target_audience,
      conversion_event: funnel.conversion_event,
      notes: funnel.notes,
    },
    audience_hint: input.audienceHint ?? funnel.target_audience,
    offer_hint: input.offerHint ?? funnel.offer,
    historical_creatives_for_this_funnel: recentCreatives ?? [],
    recent_performance_this_funnel: perf ?? [],
    variation_mode: Boolean(input.variationMode),
    parent_creative: parent,
  })

  try {
    const { data, model } = await generateMarketingJson({
      systemPrompt,
      userPrompt,
      schema: creativeBatchSchema,
      maxTokens: 8000,
    })

    const concepts = data.concepts.slice(0, input.count)
    const imageProvider = getImageProvider()
    const savedIds: string[] = []

    for (const concept of concepts) {
      let imageUrl: string | null = null
      let imageMeta: Record<string, unknown> = {}

      if (input.generateImages !== false) {
        try {
          const img = await imageProvider.generateImage({
            prompt: concept.image_generation_prompt,
            pathPrefix: 'static',
          })
          imageUrl = img.imageUrl
          imageMeta = {
            image_provider: img.provider,
            storage_path: img.storagePath,
            revised_prompt: img.revisedPrompt ?? null,
          }
        } catch (err) {
          imageMeta = {
            image_error: err instanceof Error ? err.message : 'image generation failed',
          }
        }
      }

      const { data: row, error } = await admin
        .from('marketing_creatives')
        .insert({
          name: concept.concept_name,
          type: 'static',
          concept: concept.concept_name,
          angle: concept.angle,
          hook: concept.hook,
          headline: concept.headline,
          primary_text: concept.primary_text,
          description: concept.description,
          cta: concept.cta,
          visual_direction: concept.visual_direction,
          image_generation_prompt: concept.image_generation_prompt,
          image_url: imageUrl,
          target_audience: concept.target_audience,
          hypothesis: concept.hypothesis,
          expected_test_reason: concept.expected_test_reason,
          parent_creative_id: input.parentCreativeId ?? null,
          funnel_id: funnel.id,
          status: 'generated',
          source: input.variationMode ? 'variation' : 'ai',
          metadata: imageMeta,
          created_by: input.actorId ?? null,
        })
        .select('id')
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (row?.id) savedIds.push(row.id)
    }

    if (job?.id) {
      await admin
        .from('marketing_generation_jobs')
        .update({
          status: 'completed',
          output: { concept_count: concepts.length, creative_ids: savedIds, model, funnel_id: funnel.id },
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    }

    await writeMarketingAudit({
      agent: 'creative',
      decision: 'generated_creatives',
      reasoning: `Generated ${concepts.length} creative concepts for ${funnel.name}`,
      action: input.variationMode ? 'GENERATE_VARIATIONS' : 'CREATE_NEW_CREATIVE',
      confidence: 0.7,
      actor_id: input.actorId ?? null,
      input_summary: { count: input.count, funnel_id: funnel.id, funnel_slug: funnel.slug },
      execution_result: { creative_ids: savedIds },
    })

    return { concepts, jobId: job?.id ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Creative generation failed'
    if (job?.id) {
      await admin
        .from('marketing_generation_jobs')
        .update({
          status: 'failed',
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    }
    await writeMarketingAudit({
      agent: 'creative',
      decision: 'generation_failed',
      error: message,
      actor_id: input.actorId ?? null,
    })
    throw err
  }
}
