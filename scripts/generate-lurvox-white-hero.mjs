import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'white')
const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('OPENAI_API_KEY is not configured\n')
  process.exit(1)
}
const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
await mkdir(root, { recursive: true })
process.stdout.write('generate hero.webp\n')
const response = await client.images.generate({
  model: 'gpt-image-2.5-sunburst',
  prompt: [
    'Premium editorial photograph, wide horizontal frame.',
    'A bright white private gym with tall windows and pale wood floors.',
    'A woman of about 28 in a black training top and black shorts walks across the room, mid-stride, looking toward the windows, not at the camera.',
    'She is left of center and not huge in the frame. The white room and the light take most of the picture.',
    'One bright orange water bottle sits on a low bench at the right, small in the frame.',
    'Real skin, correct hands, no beauty filter.',
    'No text, no logos, no watermark, no posters.',
    'Not a before-and-after, not a body transformation, not a weigh-in.',
  ].join(' '),
  size: '1536x1024',
  n: 1,
  quality: 'high',
})
const b64 = response.data?.[0]?.b64_json
if (!b64) throw new Error('no bytes')
const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 84 }).toBuffer()
await writeFile(path.join(root, 'hero.webp'), webp)
process.stdout.write(`wrote hero.webp ${webp.length}\n`)
