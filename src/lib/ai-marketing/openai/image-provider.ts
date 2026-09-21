import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

export type ImageGenerateInput = {
  prompt: string
  size?: '1024x1024' | '1024x1536' | '1536x1024'
  pathPrefix?: string
}

export type ImageGenerateResult = {
  provider: string
  imageUrl: string | null
  storagePath: string | null
  b64?: string
  revisedPrompt?: string | null
}

export interface ImageProvider {
  name: string
  generateImage(input: ImageGenerateInput): Promise<ImageGenerateResult>
  editImage?(input: ImageGenerateInput & { sourceUrl: string }): Promise<ImageGenerateResult>
}

export class OpenAIImageProvider implements ImageProvider {
  name = 'openai'

  async generateImage(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured for image generation')
    }

    const client = new OpenAI({ apiKey })
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'
    const size = input.size ?? '1024x1024'

    const response = await client.images.generate({
      model,
      prompt: input.prompt,
      size,
      n: 1,
    })

    const first = response.data?.[0]
    const b64 = (first as { b64_json?: string } | undefined)?.b64_json
    const url = first?.url ?? null

    if (b64) {
      const stored = await storeMarketingImage(b64, input.pathPrefix ?? 'static')
      return {
        provider: this.name,
        imageUrl: stored.publicOrSignedUrl,
        storagePath: stored.path,
        b64,
        revisedPrompt: first?.revised_prompt ?? null,
      }
    }

    return {
      provider: this.name,
      imageUrl: url,
      storagePath: null,
      revisedPrompt: first?.revised_prompt ?? null,
    }
  }
}

export class StubImageProvider implements ImageProvider {
  name = 'stub'

  async generateImage(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    return {
      provider: this.name,
      imageUrl: null,
      storagePath: null,
      revisedPrompt: `[STUB] Would generate: ${input.prompt.slice(0, 120)}`,
    }
  }
}

export function getImageProvider(): ImageProvider {
  if (process.env.OPENAI_API_KEY?.trim()) return new OpenAIImageProvider()
  return new StubImageProvider()
}

async function storeMarketingImage(
  b64: string,
  prefix: string
): Promise<{ path: string; publicOrSignedUrl: string | null }> {
  const admin = createAdminClient()
  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`
  const buffer = Buffer.from(b64, 'base64')

  const { error } = await admin.storage.from('marketing-creatives').upload(path, buffer, {
    contentType: 'image/png',
    upsert: false,
  })

  if (error) {
    console.error('[image-provider] storage upload failed', error.message)
    return { path, publicOrSignedUrl: null }
  }

  const { data: signed } = await admin.storage
    .from('marketing-creatives')
    .createSignedUrl(path, 60 * 60 * 24 * 7)

  return { path, publicOrSignedUrl: signed?.signedUrl ?? null }
}
