/**
 * One diet still: the stored female reference, eating.
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-diet-portrait.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { toFile } from 'openai'
import OpenAI from 'openai'
import sharp from 'sharp'

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'dark')
const ref = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign', 'refs', 'female-a.webp')

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const client = new OpenAI({ apiKey })
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'
  const png = await sharp(ref).png().toBuffer()
  const image = await toFile(png, 'reference.png', { type: 'image/png' })
  const prompt = [
    'Keep the exact same adult woman, face, age, hair, and skin tone as the reference photograph.',
    'Vertical 4:5 luxury food photograph.',
    'She is seated at a dark stone table in a private dining room at night, eating.',
    'She is about 27, strikingly beautiful, fine features, clear realistic skin, calm eyes, a quiet closed-mouth expression.',
    'She wears a black fine-knit long-sleeve top, fully clothed, no logos.',
    'One hand holds a fork with a correct grip and five fingers. The other rests beside a matte charcoal plate.',
    'The plate holds dal, rice, a folded roti, and greens. A small bowl of dal sits beside it.',
    'A single soft warm key light falls on her face and the plate. The room behind her is deep charcoal, out of focus.',
    '50mm lens, face sharp and fully visible, shoulders in frame, not a passport crop.',
    'Shot on a full-frame camera. Natural pores, realistic eyes, no plastic skin, no extra fingers, no text, no watermark.',
  ].join(' ')
  const response = await client.images.edit({
    model,
    image,
    prompt,
    size: '1024x1536',
    n: 1,
    quality: 'high',
  } as never)
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('no image bytes returned')
  await mkdir(root, { recursive: true })
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 84 }).toBuffer()
  await writeFile(path.join(root, 'diet-woman.webp'), webp)
  process.stdout.write(`wrote diet-woman.webp ${webp.length}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
