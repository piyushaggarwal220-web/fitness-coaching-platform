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

const photo =
  'Premium photograph, real skin, correct anatomy, no beauty filter, no text, no logos, no watermark, not a before-and-after, not a weigh-in, not a celebrity.'
const studio = 'Bright white studio, orange rim light on one edge, the rest of the room white and airy, simple black training clothes.'

const jobs = [
  {
    file: 'hero-2.webp',
    size: '1536x1024',
    quality: 'high',
    prompt: `${photo} ${studio} Horizontal. One athletic South Asian woman in her early thirties, mid-stride, controlled and calm.`,
  },
  {
    file: 'hero-3.webp',
    size: '1536x1024',
    quality: 'high',
    prompt: `${photo} ${studio} Horizontal. One athletic South Asian man in his thirties holding a still lunge, facing three-quarters, not jumping.`,
  },
  {
    file: 'avatar-1.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian woman, early thirties, hair tied back, calm expression, looking at camera.`,
  },
  {
    file: 'avatar-2.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian man, late twenties, short hair, calm expression, looking at camera.`,
  },
  {
    file: 'avatar-3.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian woman, early forties, shoulder-length hair, calm expression, looking at camera.`,
  },
  {
    file: 'avatar-4.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian man, early forties, light stubble, calm expression, looking at camera.`,
  },
  {
    file: 'avatar-5.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian woman, early twenties, braid over one shoulder, calm expression, looking at camera.`,
  },
  {
    file: 'avatar-6.webp',
    size: '1024x1024',
    quality: 'medium',
    prompt: `${photo} ${studio} Square head-and-shoulders portrait. South Asian man, mid thirties, glasses, calm expression, looking at camera.`,
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
    size: job.size,
    quality: job.quality,
    n: 1,
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no image bytes for ${job.file}`)
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 82 }).toBuffer()
  await writeFile(out, webp)
  process.stdout.write(`wrote ${job.file} ${webp.length}\n`)
}
