import { getBrandContext } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { instagramBatchSchema } from '@/lib/ai-marketing/validation/schemas'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export async function generateInstagramIdeas(input: {
  count: 5 | 10 | 20
  topicHint?: string
  actorId?: string | null
}) {
  const brand = await getBrandContext()
  const admin = createAdminClient()

  const { data: previous } = await admin
    .from('marketing_content')
    .select(
      'topic, hook, caption, views, reach, likes, comments, shares, saves, followers_gained, content_category'
    )
    .eq('platform', 'instagram')
    .order('created_at', { ascending: false })
    .limit(30)

  const systemPrompt = `You are the LURVOX Instagram SEO/Content Agent.
Generate organic content ideas (not spammy ads).
Rules:
- No keyword stuffing.
- Hashtags only when natural and limited.
- Prefer educational, transformation-process, myth-busting, and beginner clarity angles.
- Scripts should work as Reels (hooks in first 2 seconds).`

  const { data } = await generateMarketingJson({
    systemPrompt,
    userPrompt: JSON.stringify({
      count: input.count,
      brand,
      topic_hint: input.topicHint,
      previous_content: previous ?? [],
    }),
    schema: instagramBatchSchema,
    maxTokens: 7000,
  })

  const saved: string[] = []
  const start = new Date()
  for (let i = 0; i < data.ideas.length; i++) {
    const idea = data.ideas[i]!
    const scheduled = new Date(start)
    scheduled.setDate(scheduled.getDate() + i)

    const { data: row } = await admin
      .from('marketing_content')
      .insert({
        platform: 'instagram',
        content_type: 'idea',
        topic: idea.content_topic,
        hook: idea.hook,
        script: idea.script,
        caption: idea.caption,
        keywords: idea.keywords,
        hashtags: idea.hashtags,
        cta: idea.cta,
        content_category: idea.content_category,
        reason: idea.reason_for_recommendation,
        status: 'idea',
        scheduled_for: scheduled.toISOString(),
        metadata: { seo_notes: data.seo_notes },
        created_by: input.actorId ?? null,
      })
      .select('id')
      .maybeSingle()
    if (row?.id) saved.push(row.id)
  }

  await writeMarketingAudit({
    agent: 'instagram',
    decision: 'generated_content_ideas',
    reasoning: `Generated ${saved.length} Instagram ideas`,
    action: 'CREATE_NEW_CREATIVE',
    actor_id: input.actorId ?? null,
    execution_result: { content_ids: saved, seo_notes: data.seo_notes },
  })

  return { ideas: data.ideas, contentIds: saved, seoNotes: data.seo_notes }
}
