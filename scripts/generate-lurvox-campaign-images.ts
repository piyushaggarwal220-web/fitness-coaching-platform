/**
 * Build-time campaign stills for the LURVOX marketing site.
 * Server/dev only. Reads OPENAI_API_KEY from the environment. Never prints it.
 *
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-campaign-images.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const STYLE = [
  'Photorealistic cinematic commercial photograph for a premium athletic brand.',
  'Natural skin with visible pores, realistic anatomy and proportions, professional lighting,',
  'dark controlled environment, strong subject separation, subtle warm orange rim light.',
  'No text, no logos, no watermark, no neon, no plastic skin, no extra fingers,',
  'no bodybuilder exaggeration, no cheesy pose, no stock-photo smile.',
].join(' ')

const MALE =
  'South Asian man in his early thirties, short black hair, light stubble, lean athletic build, calm closed-mouth expression, matte charcoal training clothes.'

const FEMALE =
  'South Asian woman in her late twenties, dark hair in a low bun, lean athletic build, calm closed-mouth expression, matte charcoal training clothes.'

type Size = '1024x1024' | '1024x1536' | '1536x1024'

const JOBS: { file: string; size: Size; prompt: string }[] = [
  {
    file: 'hero/hero-athletic-male.webp',
    size: '1536x1024',
    prompt: `${STYLE} ${MALE} Standing in a dark architectural studio, three-quarter view, generous empty space on the left, full torso, hands relaxed, dramatic commercial light.`,
  },
  {
    file: 'goals/goal-fat-loss.webp',
    size: '1024x1536',
    prompt: `${STYLE} ${FEMALE} Walking through a quiet modern apartment in the morning, athletic but not extremely lean, natural window light mixed with shadow, lifestyle not a gym pose.`,
  },
  {
    file: 'goals/goal-muscle-gain.webp',
    size: '1024x1536',
    prompt: `${STYLE} ${MALE} In a dark premium gym, mid dumbbell row, realistic muscle, focused, no screaming, no chalk clouds, no neon.`,
  },
  {
    file: 'goals/goal-athletic.webp',
    size: '1024x1536',
    prompt: `${STYLE} ${FEMALE} Outdoors at dusk on a quiet city running path, athletic conditioning build, motion settled, dark background, editorial sports campaign.`,
  },
  {
    file: 'editorial/training-strength.webp',
    size: '1536x1024',
    prompt: `${STYLE} ${MALE} Setting up a barbell in a dark studio gym, side light, precise posture, hands clearly gripping the bar with five fingers each, no crowd.`,
  },
  {
    file: 'editorial/nutrition-editorial.webp',
    size: '1536x1024',
    prompt: `${STYLE} Overhead photograph of a simple high-protein meal on a dark stone table: rice, grilled fish, greens, olive oil. No people, no hands, no packaging logos, restaurant lighting.`,
  },
  {
    file: 'editorial/recovery-editorial.webp',
    size: '1536x1024',
    prompt: `${STYLE} ${FEMALE} Resting on a low sofa in a dim modern home, eyes closed, calm recovery, blanket, no gym equipment, soft side light, quiet mood.`,
  },
]

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const client = new OpenAI({ apiKey })
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'
  const root = path.join(process.cwd(), 'public', 'images', 'lurvox')

  for (const job of JOBS) {
    const dest = path.join(root, job.file)
    process.stdout.write(`generating ${job.file}\n`)
    const response = await client.images.generate({
      model,
      prompt: job.prompt,
      size: job.size,
      n: 1,
    })
    const first = response.data?.[0]
    const b64 = (first as { b64_json?: string } | undefined)?.b64_json
    let input: Buffer
    if (b64) {
      input = Buffer.from(b64, 'base64')
    } else if (first?.url) {
      const fetched = await fetch(first.url)
      if (!fetched.ok) throw new Error(`download failed for ${job.file}`)
      input = Buffer.from(await fetched.arrayBuffer())
    } else {
      throw new Error(`no image returned for ${job.file}`)
    }

    await mkdir(path.dirname(dest), { recursive: true })
    const webp = await sharp(input).rotate().webp({ quality: 78 }).toBuffer()
    await writeFile(dest, webp)
    process.stdout.write(`wrote ${job.file} ${webp.length} bytes\n`)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'image generation failed'
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
