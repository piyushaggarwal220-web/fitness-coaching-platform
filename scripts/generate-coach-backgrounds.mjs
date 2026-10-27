import fs from 'node:fs'
import path from 'node:path'
import OpenAI, { toFile } from 'openai'
import sharp from 'sharp'

const root = path.join(process.cwd(), 'public', 'landing')
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 300_000, maxRetries: 1 })

const jobs = [
  {
    id: 'piyush',
    source: 'instant-coach-piyush.png',
    file: 'coach-piyush-dark.webp',
    prompt: [
      'Keep this exact man: same face, hair, body, pose, hands, and white shorts.',
      'Do not change his identity, age, or expression.',
      'Replace only the plain light background with a dark private gym.',
      'Charcoal walls, a soft cool window, a rack blurred behind him, low cinematic light.',
      'Photographic, quiet, no text, no logos, no extra people.',
    ].join(' '),
  },
  {
    id: 'rakshit',
    source: 'instant-coach-rakshit.png',
    file: 'coach-rakshit-dark.webp',
    prompt: [
      'Keep this exact man: same face, hair, body, pose, clothing, and hands.',
      'Do not change his identity, age, or expression.',
      'Replace only the plain light background with a dark private gym.',
      'Charcoal walls, a soft cool window, a rack blurred behind him, low cinematic light.',
      'Photographic, quiet, no text, no logos, no extra people.',
    ].join(' '),
  },
]

for (const job of jobs) {
  process.stdout.write(`edit ${job.id}\n`)
  const jpeg = await sharp(path.join(root, job.source)).jpeg({ quality: 92 }).toBuffer()
  const image = await toFile(jpeg, `${job.id}.jpg`, { type: 'image/jpeg' })
  const response = await client.images.edit({
    model: 'gpt-image-2.5-sunburst',
    image,
    prompt: job.prompt,
    size: '1024x1536',
    quality: 'high',
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no bytes for ${job.id}`)
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 86 }).toBuffer()
  await fs.promises.writeFile(path.join(root, job.file), webp)
  process.stdout.write(`wrote ${job.file} ${webp.length}\n`)
}
