/**
 * Campaign cast for the LURVOX marketing site.
 * Server-side only. Reads OPENAI_API_KEY from the environment.
 *
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-cast.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { toFile } from 'openai'
import OpenAI from 'openai'
import sharp from 'sharp'

const NEGATIVE = [
  'No text, logos, watermarks, brand marks, or typography.',
  'No plastic skin, waxy face, uncanny eyes, extra fingers, distorted hands, warped equipment, or impossible anatomy.',
  'No bodybuilding contest pose, steroid exaggeration, screaming, thumbs-up, mirror selfie, cheap gym, dirty room, neon, cyberpunk, or stock-photo smile.',
].join(' ')

const MALE_A =
  'The same Caucasian European man, age 28: dark brown hair in a precise contemporary crop, light stubble, lean athletic build around 12% body fat, calm confident expression, natural skin with visible pores.'

const FEMALE_A =
  'The same Caucasian European woman, age 27: dark brown hair worn down and groomed, lean athletic feminine physique, natural makeup, calm expression, natural skin with visible pores.'

const MALE_B =
  'The same Caucasian European man, age 29: lighter sandy-brown hair, slightly more muscular than a lean runner, natural strength, short beard, calm focus, natural skin with visible pores.'

const FEMALE_B =
  'The same Caucasian European woman, age 28: honey-blonde hair tied back, lean strong runner physique, different face from any dark-haired woman, natural makeup, natural skin with visible pores.'

type Size = '1024x1024' | '1024x1536' | '1536x1024'

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign')

async function save(buffer: Buffer, file: string) {
  const dest = path.join(root, file)
  await mkdir(path.dirname(dest), { recursive: true })
  const webp = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer()
  await writeFile(dest, webp)
  process.stdout.write(`wrote ${file} ${webp.length}\n`)
  return dest
}

function firstBuffer(response: { data?: Array<{ b64_json?: string; url?: string | null }> }) {
  const first = response.data?.[0]
  const b64 = first?.b64_json
  if (!b64) throw new Error('no image bytes returned')
  return Buffer.from(b64, 'base64')
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const client = new OpenAI({ apiKey })
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'

  async function generate(prompt: string, size: Size, file: string) {
    process.stdout.write(`generate ${file}\n`)
    const response = await client.images.generate({
      model,
      prompt: `${prompt} ${NEGATIVE}`,
      size,
      n: 1,
      quality: 'high',
    } as never)
    return save(firstBuffer(response), file)
  }

  async function edit(refFile: string, prompt: string, size: Size, file: string) {
    process.stdout.write(`edit ${file} from ${refFile}\n`)
    const ref = path.join(root, refFile)
    const png = await sharp(ref).png().toBuffer()
    const image = await toFile(png, 'reference.png', { type: 'image/png' })
    const response = await client.images.edit({
      model,
      image,
      prompt: `Keep the exact same person, face, age, hair, and skin tone as the reference photo. ${prompt} ${NEGATIVE}`,
      size,
      n: 1,
      quality: 'high',
    } as never)
    return save(firstBuffer(response), file)
  }

  await generate(
    `Commercial head-and-shoulders portrait. ${MALE_A} Black technical shirt, dark charcoal seamless background, large soft key light, subtle warm rim. Full-frame 85mm, realistic eyes and skin.`,
    '1024x1024',
    'refs/male-a.webp'
  )
  await generate(
    `Commercial head-and-shoulders portrait. ${FEMALE_A} Black athletic top, dark charcoal seamless background, large soft key light. Full-frame 85mm, realistic eyes and skin.`,
    '1024x1024',
    'refs/female-a.webp'
  )
  await generate(
    `Commercial head-and-shoulders portrait. ${MALE_B} Black technical shirt, dark charcoal seamless background, large soft key light. Full-frame 85mm, realistic eyes and skin.`,
    '1024x1024',
    'refs/male-b.webp'
  )
  await generate(
    `Commercial head-and-shoulders portrait. ${FEMALE_B} Black athletic top, dark charcoal seamless background, large soft key light. Full-frame 85mm, realistic eyes and skin.`,
    '1024x1024',
    'refs/female-b.webp'
  )

  await edit(
    'refs/male-a.webp',
    `${MALE_A} Full torso, standing in a luxurious modern private gym of dark charcoal concrete and black steel. Premium black technical athleticwear, no logos. Cinematic side light, a small warm architectural accent far in the background. 50mm, generous empty space on the left for typography. Calm expression. Hands relaxed and anatomically correct.`,
    '1536x1024',
    'hero-male.webp'
  )
  await edit(
    'refs/female-a.webp',
    `${FEMALE_A} Standing in a luxurious contemporary apartment with concrete and large windows, soft morning light. Premium minimalist black athleticwear, no logos. Editorial 50mm campaign, elegant, not a gym pose.`,
    '1024x1536',
    'goal-fat-loss.webp'
  )
  await edit(
    'refs/male-b.webp',
    `${MALE_B} Training with a quality barbell in an architectural private gym, dark concrete and black steel. Premium black athleticwear, no logos. Cinematic side light, natural effort, no screaming. 50mm. Hands clearly gripping the bar.`,
    '1024x1536',
    'goal-muscle.webp'
  )
  await edit(
    'refs/female-b.webp',
    `${FEMALE_B} Running through a modern architectural city at sunrise. Premium black and charcoal running apparel, no logos. 35mm, subject sharp, background slightly in motion. Lean and strong, not extreme.`,
    '1024x1536',
    'goal-athletic.webp'
  )
  await edit(
    'refs/male-b.webp',
    `${MALE_B} Mid-set dumbbell row in the same private gym, side angle, premium black kit, no logos. 50mm, realistic hands, understated effort.`,
    '1536x1024',
    'train.webp'
  )
  await generate(
    'High-end editorial food photograph in a modern concrete kitchen. A real meal on dark stoneware: grilled fish, greens, rice, olive oil, linen napkin. Soft window light, neutral palette, no people, no hands, no packaging, no logos.',
    '1536x1024',
    'eat.webp'
  )
  await edit(
    'refs/female-a.webp',
    `${FEMALE_A} Sitting on the edge of a bed in a minimal premium bedroom, morning window light, black lounge set, calm, no gym equipment. 50mm, quiet and expensive.`,
    '1536x1024',
    'recover.webp'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
