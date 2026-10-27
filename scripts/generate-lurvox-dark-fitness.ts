/**
 * Dark fitness campaign stills. Same cast as the stored references.
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-dark-fitness.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { toFile } from 'openai'
import OpenAI from 'openai'
import sharp from 'sharp'

const CAMERA = [
  'Shot on a full-frame camera, commercial fitness campaign, not a phone photo and not a studio headshot on a grey seamless.',
  'Natural skin with visible pores, realistic eyes, realistic hands, correct anatomy.',
  'Deep detailed shadows, controlled highlights, restrained contrast, no HDR, no neon, no orange color cast, no cyberpunk.',
  'Black and charcoal wardrobe, no logos, no text, no watermark.',
  'The face stays visible and sharp. The frame includes the room, not a floating passport crop.',
  'No screaming, no bodybuilding pose, no steroid exaggeration, no extra fingers, no plastic skin.',
].join(' ')

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'dark')
const refs = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign', 'refs')

async function save(buffer: Buffer, file: string) {
  const dest = path.join(root, file)
  await mkdir(path.dirname(dest), { recursive: true })
  const webp = await sharp(buffer).rotate().webp({ quality: 84 }).toBuffer()
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
      prompt: `Keep the exact same person, face, age, hair, and skin tone as the reference photograph. ${prompt} ${CAMERA}`,
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
      prompt: `${prompt} ${CAMERA}`,
      size: '1536x1024',
      n: 1,
      quality: 'high',
    } as never)
    await save(firstBuffer(response), file)
  }

  await edit(
    'male-a.webp',
    [
      'Vertical 4:5 campaign frame for a premium fitness brand.',
      'A lean athletic man, about 28, standing three-quarter length inside a private architectural gym at night.',
      'Dark charcoal concrete walls, black steel rig barely visible in the shadow, one hard rim light from camera right and a large soft key from the left.',
      'He wears a black technical short-sleeve training shirt and black shorts, no logos.',
      'Calm expression, shoulders relaxed, hands at his sides with five correct fingers.',
      '50mm lens, subject sharp, background falls off, generous dark space above his head.',
      'The photograph should feel like a still from a high-budget sportswear film, not a LinkedIn portrait.',
    ].join(' '),
    '1024x1536',
    'hero.webp'
  )

  await edit(
    'female-a.webp',
    [
      'Vertical campaign frame.',
      'The same woman in a dark apartment at dawn, standing beside a floor-to-ceiling window.',
      'Outside is still blue-grey. Inside is charcoal plaster and a low black bench.',
      'She wears a black training set. Face fully visible, calm, not smiling for the camera.',
      'Soft window light on one side of her face, the other side in deep shadow with detail kept.',
      '50mm, three-quarter length, athletic but not extreme, no gym-bro pose.',
    ].join(' '),
    '1024x1536',
    'fat-loss.webp'
  )

  await edit(
    'male-b.webp',
    [
      'Vertical frame inside a dark performance gym.',
      'The same man in the bottom of a squat, a loaded barbell across his upper back, black plates, knurled bar.',
      'Charcoal concrete and a black rack. One directional key light carves the arms and face. Face is visible and focused, not screaming.',
      'Black shorts and a black shirt. Hands wrapped correctly on the bar, thumbs around the bar.',
      '35mm, low camera, powerful but believable physique, not a contest pose.',
    ].join(' '),
    '1024x1536',
    'muscle.webp'
  )

  await edit(
    'female-b.webp',
    [
      'Vertical frame of the same woman running on a dark city street before sunrise.',
      'Wet asphalt, black glass buildings, cool ambient light, a single warm practical far behind her, not lighting her orange.',
      'Black running tights and a charcoal jacket. Face sharp, body in motion, background slightly dragged.',
      '35mm, athletic stride, calm concentration, no stock-photo smile.',
    ].join(' '),
    '1024x1536',
    'athletic.webp'
  )

  await edit(
    'male-b.webp',
    [
      'Wide 3:2 frame.',
      'The same man doing a one-arm dumbbell row on a black bench in a nearly black gym.',
      'Side angle, face in profile and readable, supporting hand flat on the bench with five fingers, working hand closed on the handle.',
      'A strip of light across his back and the dumbbell. The rest of the room is shadow. 50mm.',
    ].join(' '),
    '1536x1024',
    'train.webp'
  )

  await edit(
    'female-a.webp',
    [
      'Wide 3:2 frame.',
      'The same woman sitting on the edge of a bed in a dark bedroom, one window with grey morning light.',
      'Black tank, linen sheets in shadow, face turned toward the window and clearly visible.',
      'Quiet, expensive, no gym equipment. 50mm, shallow depth.',
    ].join(' '),
    '1536x1024',
    'recover.webp'
  )

  await generate(
    [
      'Wide 3:2 editorial food photograph in a dark kitchen.',
      'A black stone counter, one pool of window light.',
      'A real Indian meal on matte charcoal ceramic: dal, rice, a folded roti, and greens.',
      'No people, no hands, no packaging, no logos. The rest of the kitchen falls into shadow.',
    ].join(' '),
    'eat.webp'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
