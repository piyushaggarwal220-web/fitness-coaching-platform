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

const look =
  'Premium photograph, one athletic adult, white studio, orange rim light, simple black training clothes, real skin, correct anatomy, no text, no logos, no watermark, not a before-and-after, not a celebrity.'

const jobs = [
  { file: 'move-squat.webp', prompt: `${look} Square. Mid-squat, side view, controlled depth.` },
  { file: 'move-row.webp', prompt: `${look} Square. Bent-over dumbbell row, one arm, side view.` },
  { file: 'move-press.webp', prompt: `${look} Square. Standing dumbbell press, both arms, front three-quarter view.` },
  { file: 'move-hinge.webp', prompt: `${look} Square. Hip hinge with a light barbell, side view, flat back.` },
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
