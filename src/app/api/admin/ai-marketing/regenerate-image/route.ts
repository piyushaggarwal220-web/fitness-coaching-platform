import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImageProvider } from '@/lib/ai-marketing/openai/image-provider'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Regenerate image for an existing creative using its stored prompt (or override). */
export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    creativeId?: string
    promptOverride?: string
  }

  if (!body.creativeId) {
    return NextResponse.json({ success: false, error: 'creativeId required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: creative, error } = await admin
    .from('marketing_creatives')
    .select('*')
    .eq('id', body.creativeId)
    .maybeSingle()

  if (error || !creative) {
    return NextResponse.json({ success: false, error: 'Creative not found' }, { status: 404 })
  }

  const prompt =
    body.promptOverride?.trim() ||
    String(creative.image_generation_prompt || creative.visual_direction || '')

  if (!prompt) {
    return NextResponse.json(
      { success: false, error: 'No image_generation_prompt on creative' },
      { status: 400 }
    )
  }

  try {
    const provider = getImageProvider()
    const img = await provider.generateImage({
      prompt,
      pathPrefix: 'static',
    })

    if (!img.imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            provider.name === 'stub'
              ? 'OPENAI_API_KEY missing — image provider is stub'
              : 'Image generation returned no URL',
          provider: provider.name,
        },
        { status: 400 }
      )
    }

    const { data: updated, error: upErr } = await admin
      .from('marketing_creatives')
      .update({
        image_url: img.imageUrl,
        image_generation_prompt: prompt,
        metadata: {
          ...(typeof creative.metadata === 'object' && creative.metadata
            ? (creative.metadata as object)
            : {}),
          image_provider: img.provider,
          storage_path: img.storagePath,
          revised_prompt: img.revisedPrompt ?? null,
          regenerated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', creative.id)
      .select('*')
      .maybeSingle()

    if (upErr) {
      return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })
    }

    await writeMarketingAudit({
      agent: 'creative',
      decision: 'regenerated_image',
      actor_id: auth.user.id,
      execution_result: { creative_id: creative.id, provider: img.provider },
    })

    return NextResponse.json({ success: true, creative: updated })
  } catch (err) {
    console.error('[ai-marketing/regenerate-image]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Regenerate failed' },
      { status: 500 }
    )
  }
}
