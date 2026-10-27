import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'white')
const model = 'gpt-image-2.5-sunburst'
const look = [
  'Premium editorial photograph, wide horizontal frame.',
  'Bright white room, daylight from a large window, clean and airy.',
  'One bright orange accent only, about #FF4D00, never a flood of orange.',
  'Real skin, correct hands, no beauty filter, no plastic skin.',
  'No text, no logos, no watermark, no readable screen, no posters.',
  'Not a before-and-after, not a body transformation, not a weigh-in.',
].join(' ')

const jobs = [
  {
    file: 'train.webp',
    prompt: [
      'A man of about 30 with short dark hair does a seated cable row in a bright white private studio.',
      'White walls, pale wood floor, black cables, one orange towel on a bench at the right.',
      'He looks at the handle, not at the camera. Calm effort. Charcoal shirt, black shorts.',
      'He is left of center. The bright room continues to the right.',
      look,
    ].join(' '),
  },
  {
    file: 'eat.webp',
    prompt: [
      'A white ceramic plate on a white marble counter: grilled chicken, rice, and greens.',
      'One whole orange sits beside the plate. A glass of water. Soft morning light.',
      'No people. No labels. No packaging. The plate is left of center and the counter runs to the right.',
      look,
    ].join(' '),
  },
  {
    file: 'checkin.webp',
    prompt: [
      'A woman of about 28 sits by a bright window in a white room, holding a phone loosely.',
      'She looks out the window, not at the lens. White shirt. An orange notebook is closed on the table.',
      'The phone screen is dark and unreadable. She is left of center. The window fills the right side.',
      look,
    ].join(' '),
  },
  {
    file: 'write.webp',
    prompt: [
      'A coach in a white shirt sits at a white desk, writing in a plain notebook with an orange pen.',
      'His face is turned down toward the page, not at the camera. A closed laptop beside the notebook.',
      'Bright window behind him, slightly out of focus. He is left of center. The desk continues right.',
      'The writing on the page is abstract marks, not readable words.',
      look,
    ].join(' '),
  },
]

const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('OPENAI_API_KEY is not configured\n')
  process.exit(1)
}
const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
await mkdir(root, { recursive: true })

for (const job of jobs) {
  process.stdout.write(`generate ${job.file}\n`)
  const response = await client.images.generate({
    model,
    prompt: job.prompt,
    size: '1536x1024',
    n: 1,
    quality: 'high',
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no bytes for ${job.file}`)
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 84 }).toBuffer()
  await writeFile(path.join(root, job.file), webp)
  process.stdout.write(`wrote ${job.file} ${webp.length}\n`)
}
