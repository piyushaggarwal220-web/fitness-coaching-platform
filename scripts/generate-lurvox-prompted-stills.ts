/**
 * Ask the chat model for image prompts, then render those prompts.
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-prompted-stills.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { toFile } from 'openai'
import OpenAI from 'openai'
import sharp from 'sharp'

const CHAT_MODEL = 'gpt-5.6-terra'
const IMAGE_MODEL = 'gpt-image-2.5-sunburst'

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'dark')
const refs = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign', 'refs')
const promptFile = path.join(process.cwd(), 'scripts', 'lurvox-image-prompts.json')

const JOBS = [
  { id: 'hero', ref: 'male-a.webp', file: 'hero.webp' },
  { id: 'muscle', ref: 'male-b.webp', file: 'muscle.webp' },
  { id: 'athletic', ref: 'female-b.webp', file: 'athletic.webp' },
  { id: 'train', ref: 'male-a.webp', file: 'train.webp' },
  { id: 'diet', ref: 'female-a.webp', file: 'diet-woman.webp' },
  { id: 'track', ref: 'male-b.webp', file: 'track.webp' },
  { id: 'checkin', ref: 'female-a.webp', file: 'checkin.webp' },
  { id: 'progress', ref: 'male-b.webp', file: 'progress.webp' },
  { id: 'intake', ref: 'female-b.webp', file: 'intake.webp' },
  { id: 'plan', ref: 'male-a.webp', file: 'plan.webp' },
] as const

const SITUATION = `
Audit these homepage photographs, then write a new image prompt for every slot. Another system will send your prompt unchanged to an image editor with one reference photo. Keep that person's face, age, hair, and skin tone. You may change their physique, clothing, and action so the picture sells the slot.

LURVOX sells online coaching. Three plans sit on the first screen and the photo changes with the tab:
- Fat loss, 90 days. The photo must sell fat loss. A man standing still and looking at the camera does not. Show a visibly lean waist and midsection during fat-loss work: incline walk, brisk conditioning, or a circuit. Fitted black training clothes so the lean torso is obvious. He is working, not posing for a portrait. His face stays in frame.
- Fat loss and muscle gain, 6 months. The photo must sell both. A normal-looking person in a casual squat does not. Show a lean waist plus clearly developed shoulders, chest, and arms, mid-rep on a heavy compound lift. The muscle is the subject. Face stays in frame. Not a headshot.
- Athletic body, 12 months. The photo must sell an athletic body in motion. Show a sport-conditioned runner or athlete: strong legs, capable torso, full stride, face in frame. Not a portrait, not a cropped headless body.

The site then has tabs. Each photo must match that tab, not be a generic portrait:
- Workout: an actual training set, muscles working, face visible.
- Diet: an adult woman eating a planned Indian meal (dal, rice, roti, greens), fully clothed, face visible.
- Track: logging a workout and a meal in real life. Closed notebook, meal on the table, phone face-down. No app screen.
- Check-in: a weekly body measurement with a cloth tape, face visible, no numbers.
- Progress: someone studying their own physique in a mirror, face visible. Not a before-and-after ad and no fake results.
- Tell us about you: a person answering questions about goals, food, and schedule. Closed blank notebook.
- Get your plan: a person who has just received a prepared plan, holding a closed notebook, no readable writing.

The page crops photos toward the upper-middle. Put the face and the body part that proves the goal inside the upper 70 percent of a vertical frame. Do not hide the waist, the muscle, or the stride at the very bottom.

Every prompt must also say: vertical 4:5 commercial photo, whole head inside the frame with space above the hair, fully clothed, natural skin, correct hands, no text, no logos, no phone screens, no numbers, no orange color cast, beige and deep green and charcoal light, soothing rather than a loud gym ad.

Return only JSON, no markdown:
{"prompts":[{"id":"hero","prompt":"..."},{"id":"muscle","prompt":"..."},{"id":"athletic","prompt":"..."},{"id":"train","prompt":"..."},{"id":"diet","prompt":"..."},{"id":"track","prompt":"..."},{"id":"checkin","prompt":"..."},{"id":"progress","prompt":"..."},{"id":"intake","prompt":"..."},{"id":"plan","prompt":"..."}]}
`.trim()

type PromptRow = { id: string; prompt: string }

function parsePrompts(text: string): PromptRow[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('chat model did not return JSON')
  const parsed = JSON.parse(text.slice(start, end + 1)) as { prompts?: PromptRow[] }
  const rows = parsed.prompts ?? []
  for (const job of JOBS) {
    const row = rows.find((item) => item.id === job.id)
    if (!row?.prompt?.trim()) throw new Error(`missing prompt for ${job.id}`)
  }
  return rows
}

async function askForPrompts(client: OpenAI): Promise<PromptRow[]> {
  process.stdout.write(`chat ${CHAT_MODEL}\n`)
  const response = await client.responses.create({
    model: CHAT_MODEL,
    max_output_tokens: 4000,
    reasoning: { effort: 'medium' },
    input: [{ role: 'user', content: SITUATION }],
  })
  const text = response.output_text ?? ''
  if (!text.trim()) throw new Error('chat model returned empty text')
  const rows = parsePrompts(text)
  await writeFile(promptFile, JSON.stringify({ model: CHAT_MODEL, prompts: rows }, null, 2))
  process.stdout.write(`wrote prompts ${rows.length}\n`)
  return rows
}

async function editOne(
  client: OpenAI,
  model: string,
  refName: string,
  prompt: string,
  file: string,
) {
  const png = await sharp(path.join(refs, refName)).png().toBuffer()
  const image = await toFile(png, 'reference.png', { type: 'image/png' })
  const response = await client.images.edit({
    model,
    image,
    prompt,
    size: '1024x1536',
    n: 1,
    quality: 'high',
  } as never)
  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error(`no image bytes for ${file}`)
  const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 92 }).toBuffer()
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, file), webp)
  process.stdout.write(`wrote ${file} ${webp.length} via ${model}\n`)
}

const REVISE = `
The image model missed the point on two prompts. Rewrite only those two. Return JSON {"prompts":[{"id":"hero","prompt":"..."},{"id":"muscle","prompt":"..."}]} and nothing else.

hero failed: the man is standing on a treadmill looking straight at the camera in a loose black shirt. It still reads as a portrait. The new prompt must force a three-quarter side view, eyes on the path ahead, not on the lens, a fitted shirt that shows a lean waist and a slimmer midsection, uphill walking with visible effort, and the lean waist inside the upper half of the frame.

muscle failed: a loose gray shirt and a look at the camera make him read as a normal gym-goer. The new prompt must force eyes on the lift, not the lens, a fitted sleeveless or tight training top that is still fully clothed, clearly muscular shoulders, chest, and arms, a lean waist, heavy plates, and a mid-rep squat where the physique is the subject.
`.trim()

async function reviseTwo(client: OpenAI, rows: PromptRow[]) {
  process.stdout.write(`revise ${CHAT_MODEL}\n`)
  const response = await client.responses.create({
    model: CHAT_MODEL,
    max_output_tokens: 2000,
    reasoning: { effort: 'medium' },
    input: [{ role: 'user', content: `${REVISE}\n\nCurrent hero prompt:\n${rows.find((row) => row.id === 'hero')?.prompt}\n\nCurrent muscle prompt:\n${rows.find((row) => row.id === 'muscle')?.prompt}` }],
  })
  const text = response.output_text ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('revise did not return JSON')
  const parsed = JSON.parse(text.slice(start, end + 1)) as { prompts?: PromptRow[] }
  for (const id of ['hero', 'muscle']) {
    const next = parsed.prompts?.find((row) => row.id === id)?.prompt?.trim()
    if (!next) throw new Error(`missing revised prompt for ${id}`)
    const row = rows.find((item) => item.id === id)
    if (!row) throw new Error(`missing row ${id}`)
    row.prompt = next
  }
  await writeFile(promptFile, JSON.stringify({ model: CHAT_MODEL, prompts: rows }, null, 2))
  process.stdout.write('revised hero and muscle\n')
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
  const fresh = process.argv.includes('--fresh')
  const promptsOnly = process.argv.includes('--prompts-only')
  const revise = process.argv.includes('--revise')
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null
  const saved = fresh
    ? { prompts: [] as PromptRow[] }
    : (JSON.parse(await readFile(promptFile, 'utf8')) as { prompts?: PromptRow[] })
  const rows = saved.prompts?.length ? saved.prompts : await askForPrompts(client)
  if (revise) await reviseTwo(client, rows)
  if (promptsOnly) return
  for (const job of JOBS) {
    if (!rows.find((item) => item.id === job.id)?.prompt?.trim()) {
      throw new Error(`missing prompt for ${job.id}`)
    }
  }
  let model = IMAGE_MODEL

  for (const job of JOBS) {
    if (only && !only.includes(job.id)) continue
    const prompt = rows.find((item) => item.id === job.id)!.prompt
    process.stdout.write(`edit ${job.file} with ${model}\n`)
    await editOne(client, model, job.ref, prompt, job.file)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
