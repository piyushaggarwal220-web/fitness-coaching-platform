import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

function loadEnv(file) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

loadEnv(path.join(process.cwd(), '.env.local'))

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'beige')
const model = 'gpt-image-2.5-sunburst'
const look = [
  'Square editorial photograph for a luxury coaching brand.',
  'Warm cream and beige room, soft window daylight, quiet and expensive.',
  'Brushed silver metal as a small accent. One deep forest-green detail, about #1e4d3d.',
  'Subject centered and simple enough to read as a 76 pixel thumbnail.',
  'Photoreal, natural skin, correct hands, no beauty filter, no plastic skin.',
  'No text, no letters, no numbers, no logos, no watermark, no posters, no readable screen.',
].join(' ')

const jobs = [
  {
    file: 'included-workout.webp',
    prompt: `Close photograph of one brushed-silver dumbbell lying on folded cream linen. A narrow forest-green cotton strap beside it. Nothing else in the frame. ${look}`,
  },
  {
    file: 'included-diet.webp',
    prompt: `Overhead close photograph of a cream ceramic plate with grilled chicken, herbs, and a small pool of olive oil, on beige linen. The edge of a silver fork. No packaging and no labels. ${look}`,
  },
  {
    file: 'included-guidance.webp',
    prompt: `A tight still life of two objects only: a slim silver running shoe and a small unlabeled frosted glass bottle with a silver cap. Both sit on beige linen and are recognizable at a glance. No pillow, no bed, no people. ${look}`,
  },
  {
    file: 'included-coach.webp',
    prompt: `Close photograph of two calm hands holding a silver phone in a cream room. The screen faces the person and is dark and completely unreadable. A forest-green shirt cuff. No face, no logos. ${look}`,
  },
  {
    file: 'included-checkin.webp',
    prompt: `An open cream notebook with blank pages and a silver pen laid across it. One forest-green ribbon bookmark. Morning light. The pages have no writing. ${look}`,
  },
  {
    file: 'included-trackers.webp',
    prompt: `A small cream card with three simple abstract tick marks that are not letters, beside a tiny silver dumbbell and a sprig of green herbs. Beige table, overhead, uncluttered. ${look}`,
  },
  {
    file: 'included-updates.webp',
    prompt: `A hand sliding the top card off a short stack of blank cream cards held by a silver clip. The cards have no writing. Warm desk, quiet, the hand is natural and correct. ${look}`,
  },
  {
    file: 'included-men.webp',
    prompt: `A fit man of about 30 with short dark hair stands in a cream studio holding a silver kettlebell at his side. Charcoal training shirt and shorts, fully clothed. He looks past the camera, calm. Natural skin. No medical equipment, no needles, no pills, no bottles. ${look}`,
  },
  {
    file: 'included-women.webp',
    prompt: `A fit woman of about 28 stands in a cream studio in a charcoal long-sleeve training top and full-length training tights, holding a silver kettlebell with both hands at her waist. Athletic posture, fully clothed, natural skin, looking past the camera. Tasteful and quiet. No medical equipment, no needles, no pills. ${look}`,
  },
]

const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('OPENAI_API_KEY is not configured\n')
  process.exit(1)
}

const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
await mkdir(root, { recursive: true })

async function generate(job) {
  process.stdout.write(`generate ${job.file}\n`)
  const response = await client.images.generate({
    model,
    prompt: job.prompt,
    size: '1024x1024',
    n: 1,
    quality: 'high',
    output_format: 'webp',
    output_compression: 82,
  })
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no bytes for ${job.file}`)
  const bytes = Buffer.from(b64, 'base64')
  await writeFile(path.join(root, job.file), bytes)
  process.stdout.write(`wrote ${job.file} ${bytes.length}\n`)
}

const only = process.argv[2]
const selected = only ? jobs.filter((job) => job.file === only) : jobs
if (selected.length === 0) {
  process.stderr.write(`no job named ${only}\n`)
  process.exit(1)
}
const queue = [...selected]
const workers = Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const job = queue.shift()
    if (!job) return
    await generate(job)
  }
})
await Promise.all(workers)
