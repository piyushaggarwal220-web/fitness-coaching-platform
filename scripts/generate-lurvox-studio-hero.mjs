import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const out = path.join(process.cwd(), 'public', 'images', 'lurvox', 'studio', 'hero.webp')
try {
  await access(out)
  process.stdout.write('hero.webp already exists\n')
  process.exit(0)
} catch {
  // generate
}

const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('OPENAI_API_KEY is not configured\n')
  process.exit(1)
}

const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
await mkdir(path.dirname(out), { recursive: true })
process.stdout.write('generate studio hero\n')
const response = await client.images.generate({
  model: 'gpt-image-2.5-sunburst',
  prompt: [
    'Premium photographic portrait, horizontal.',
    'One athletic adult in a bright white studio, mid-motion, a controlled jump or stride, wearing simple black training clothes.',
    'Bright orange rim light on one edge of the body. The rest of the room is white and airy.',
    'Real skin, correct hands and feet, no beauty filter, no text, no logos, no watermark.',
    'Not a before-and-after, not a weigh-in, not a transformation comparison, not a medical scene.',
  ].join(' '),
  size: '1536x1024',
  quality: 'high',
  n: 1,
})
const b64 = response.data?.[0]?.b64_json
if (!b64) throw new Error('no image bytes')
const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 82 }).toBuffer()
await writeFile(out, webp)
process.stdout.write(`wrote hero.webp ${webp.length}\n`)
