import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const dir = path.join(process.cwd(), 'public', 'images', 'lurvox', 'studio')
const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('OPENAI_API_KEY is not configured\n')
  process.exit(1)
}

const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
await mkdir(dir, { recursive: true })

const person =
  'Premium photograph, one athletic South Asian adult, white studio, orange rim light, simple black training clothes, real skin, correct anatomy, no text, no logos, no watermark, not a before-and-after, not a celebrity, face fully in frame.'

const jobs = [
  {
    file: 'stall-scatter.webp',
    prompt: `${person} Standing, holding a phone a little away from the face. The screen is a blank warm glow with no letters or icons. Expression is unsure, not smiling for a camera.`,
  },
  {
    file: 'stall-alone.webp',
    prompt: `${person} Sitting alone on a simple bench after training, towel on one shoulder, looking at the floor. No other person, no coach, no mirror selfie.`,
  },
  {
    file: 'stall-sheet.webp',
    prompt: `${person} Standing beside a neat stack of identical blank white sheets on a low bench. The paper has no writing, no lines of text, no logo. The pose is stiff, as if following a generic script.`,
  },
  {
    file: 'step-answer.webp',
    prompt: `${person} Seated on a low stool, calmly looking at a phone held in both hands. The screen is a blank warm glow with no readable text. Focused, not distressed.`,
  },
  {
    file: 'step-follow.webp',
    prompt: `${person} Mid dumbbell Romanian deadlift, side view, flat back, light dumbbells, controlled. White studio, orange rim light.`,
  },
  {
    file: 'step-rewrite.webp',
    prompt: `${person} Standing after a session, one hand on a hip, the other holding a phone down by the thigh. Screen not readable. Calm, finished, not exhausted theatrically.`,
  },
  {
    file: 'inc-food.webp',
    prompt:
      'Overhead photograph of a simple Indian meal on a white table: two boiled eggs, one folded roti, a small bowl of yellow dal, a small bowl of rice, a small bowl of curd, and paneer with cucumber. One orange linen napkin. Soft daylight, no text, no logo, no packaging, no hands.',
  },
  {
    file: 'inc-cardio.webp',
    prompt: `${person} Easy jump rope, both feet just off the floor, rope visible as a clean arc, front three-quarter view. White studio, orange rim light.`,
  },
]

for (const job of jobs) {
  const out = path.join(dir, job.file)
  try {
    await access(out)
    process.stdout.write(`skip ${job.file}\n`)
    continue
  } catch {
    // generate
  }
  process.stdout.write(`generate ${job.file}\n`)
  const response = await client.images.generate({
    model: 'gpt-image-2.5-sunburst',
    prompt: job.prompt,
    size: '1024x1024',
    quality: 'medium',
    n: 1,
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no image bytes for ${job.file}`)
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 80 }).toBuffer()
  await writeFile(out, webp)
  process.stdout.write(`wrote ${job.file} ${webp.length}\n`)
}
