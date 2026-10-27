/**
 * Face-first neutral campaign stills. Uses the existing cast references.
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-neutral-faces.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { toFile } from 'openai'
import OpenAI from 'openai'
import sharp from 'sharp'

const NEGATIVE = [
  'No text, logos, watermarks, or typography.',
  'No orange light, no neon, no dark dungeon gym, no plastic skin, no extra fingers, no distorted face.',
  'Face must be fully visible, sharp, and unobstructed. Neutral expression, calm, not angry or worried.',
].join(' ')

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'neutral')
const refs = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign', 'refs')

async function save(buffer: Buffer, file: string) {
  const dest = path.join(root, file)
  await mkdir(path.dirname(dest), { recursive: true })
  const webp = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer()
  await writeFile(dest, webp)
  process.stdout.write(`wrote ${file} ${webp.length}\n`)
}

function firstBuffer(response: { data?: Array<{ b64_json?: string }> }) {
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('no image bytes returned')
  return Buffer.from(b64, 'base64')
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const client = new OpenAI({ apiKey })
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'

  async function edit(refName: string, prompt: string, size: '1024x1536' | '1536x1024', file: string) {
    process.stdout.write(`edit ${file}\n`)
    const png = await sharp(path.join(refs, refName)).png().toBuffer()
    const image = await toFile(png, 'reference.png', { type: 'image/png' })
    const response = await client.images.edit({
      model,
      image,
      prompt: `Keep the exact same person and face as the reference. ${prompt} ${NEGATIVE}`,
      size,
      n: 1,
      quality: 'high',
    } as never)
    await save(firstBuffer(response), file)
  }

  async function generate(prompt: string, file: string) {
    process.stdout.write(`generate ${file}\n`)
    const response = await client.images.generate({
      model,
      prompt: `${prompt} ${NEGATIVE}`,
      size: '1536x1024',
      n: 1,
      quality: 'high',
    } as never)
    await save(firstBuffer(response), file)
  }

  await edit(
    'male-a.webp',
    'Premium commercial portrait, head and shoulders, face large in the frame and looking at camera. Soft daylight, pale grey seamless background, black fine-knit shirt, neutral color grade, ivory and grey only, 85mm, natural skin.',
    '1024x1536',
    'hero-face.webp'
  )
  await edit(
    'female-a.webp',
    'Premium portrait, face large and clear, standing by a pale stone window in soft daylight. Stone, ivory, and black clothing. Neutral grade, no orange. 85mm.',
    '1024x1536',
    'face-fat-loss.webp'
  )
  await edit(
    'male-b.webp',
    'Premium portrait, face large and clear, in a pale concrete gym with soft daylight. Charcoal clothing, calm, hands realistic. Neutral grey palette, no orange light. 50mm.',
    '1024x1536',
    'face-muscle.webp'
  )
  await edit(
    'female-b.webp',
    'Premium portrait of her face while walking outdoors, overcast neutral daylight, pale stone architecture, charcoal running jacket, calm expression, face sharp and large. No golden-hour orange.',
    '1024x1536',
    'face-athletic.webp'
  )
  await edit(
    'male-b.webp',
    'Close premium photograph, his face clearly visible in three-quarter view, holding a dumbbell in a pale grey studio. Neutral light, black clothing, calm focus.',
    '1536x1024',
    'face-train.webp'
  )
  await edit(
    'female-a.webp',
    'Close premium photograph, her face clearly visible, sitting in a pale linen bedroom, soft grey morning light, black top, calm. Neutral palette.',
    '1536x1024',
    'face-recover.webp'
  )
  await generate(
    'Premium food photograph on a pale stone table, neutral daylight. A quiet Indian meal: dal, rice, roti, and a small bowl of greens, matte grey ceramic, linen napkin. No people, no hands, no logos, no orange cast.',
    'eat.webp'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
