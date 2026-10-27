/**
 * Premium campaign stills for the live homepage slots.
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-campaign.ts
 *   npx tsx --env-file=.env.local scripts/generate-lurvox-campaign.ts --only=hero-fat-loss,hero-muscle
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const MODEL = 'gpt-image-2.5-sunburst'
const root = path.join(process.cwd(), 'public', 'images', 'lurvox', 'campaign')

const LOOK = [
  'Shot on a full-frame camera with a 50mm lens at f/2.8.',
  'Real skin with visible pores, faint under-eye texture, and flyaway hair. No beauty filter, no plastic skin, no waxy face.',
  'Believable athletic body, not a bodybuilder and not a superhero.',
  'Correct hands, correct eyes, natural teeth if any are visible.',
  'Light is one large window plus a soft fill. Restrained contrast. No HDR, no neon, no lens flare, no cyberpunk.',
  'Palette is charcoal, off-white, cool grey, and black. One small burnt-orange accent only, about #FF6200, never a flood of orange.',
  'No text, no logos, no watermark, no readable phone screen, no posters, no other brand marks.',
  'The whole head is inside the frame with empty space above the hair.',
  'Compose as a wide horizontal photograph. Place the person left of center. Let the room continue across the right side. Do not stack the subject in a tall portrait.',
].join(' ')

const JOBS: { id: string; file: string; prompt: string }[] = [
  {
    id: 'hero-fat-loss',
    file: 'hero-fat-loss.webp',
    prompt: [
      'Premium sports-campaign photograph, horizontal landscape.',
      'A lean man of 29 with short dark hair, light stubble, and olive skin walks uphill on a matte-black treadmill in an architect-designed private gym.',
      'Camera at chest height, three-quarter view from his left side. His eyes are on the path ahead, not on the lens.',
      'He wears a fitted charcoal short-sleeve training shirt and black shorts. The shirt shows a lean waist. There is a thin orange stitch on the heel of one shoe.',
      'Subtle sweat at the temple. Calm effort, mouth closed.',
      'Pale oak, charcoal plaster, one tall window with cool morning light. The room is almost empty.',
      'Wide frame. He is left of center. The treadmill and the window run across the frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'hero-muscle',
    file: 'hero-muscle.webp',
    prompt: [
      'Premium sports-campaign photograph, horizontal landscape.',
      'A muscular but believable man of 31, short sandy hair, fair skin, is in the bottom of a heavy barbell back squat in a private studio.',
      'Camera is low, beside his hip, three-quarter side. His eyes look forward along the lift, not at the lens.',
      'Charcoal sleeveless training top and black shorts. Shoulders, chest, and arms are developed. The waist is lean. Not a contest bodybuilder.',
      'Black iron plates, a knurled bar, thumbs around the bar, five fingers per hand.',
      'Cool north light from a high window. One small orange kettlebell sits out of focus on a rear rack.',
      'Wide frame. He is left of center. The rack and the window continue to the right.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'hero-athletic',
    file: 'hero-athletic.webp',
    prompt: [
      'High-end sports editorial, horizontal landscape.',
      'A muscular man of 29, short dark hair, light stubble, runs along a quiet modern promenade just before sunrise.',
      'He is shirtless and wearing black athletic shorts. His abdominal muscles are clearly visible. Shoulders, chest, and legs are developed and believable, not a contest bodybuilder and not a superhero.',
      'The camera moves beside him. His face is sharp and fully in frame. He looks down the path, not at the lens.',
      'A natural running stride, both feet believable, five toes if a foot is close. A small orange tab on one shoe.',
      'Wet stone, pale concrete architecture, cool blue-grey light. No orange street glow on his skin.',
      'Wide frame. He runs through the left half. The promenade continues to the right.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'training-session',
    file: 'training-session.webp',
    prompt: [
      'Premium training photograph, horizontal landscape.',
      'An athletic man of 27 with cropped black hair and medium-brown skin performs a seated cable row in a minimal private studio.',
      'Side view. He looks at the cable attachment, not at the lens. Elbows travel back, shoulders working, expression concentrated.',
      'Black t-shirt, charcoal shorts. Hands wrapped correctly on a single handle.',
      'Charcoal walls, one soft window from the left. Wide frame. He is left of center and the cable runs across the frame.',
      'A single orange collar on a plate is barely visible in the background.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'nutrition-meal',
    file: 'nutrition-meal.webp',
    prompt: [
      'Luxury food editorial, horizontal landscape, no face.',
      'Two real hands plate a meal on a pale stone counter in a quiet modern kitchen.',
      'A matte ceramic plate holds grilled chicken, rice, a folded roti, greens, and a small bowl of dal. Food has natural texture, not plastic gloss.',
      'Daylight from a side window. Linen napkin. One small orange citrus on the counter, out of the main plate.',
      'Wide frame. The plate sits left of center and the stone counter extends to the right.',
      'No labels, no packaging logos, no person looking at the camera.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'tracking-review',
    file: 'tracking-review.webp',
    prompt: [
      'Premium lifestyle photograph, horizontal landscape.',
      'A fit woman of 30 with dark hair in a knot sits on a kitchen stool after training.',
      'She looks down at a phone held low, screen tilted toward the floor so nothing on it can be read.',
      'A simple bowl of rice, greens, and dal sits on the stone counter. She wears a charcoal long-sleeve top.',
      'Cool window light, off-white walls, one dark green plant. Wide frame. She sits left of center and the counter continues right.',
      'She is not smiling at the camera.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'weekly-checkin',
    file: 'weekly-checkin.webp',
    prompt: [
      'Quiet editorial photograph, horizontal landscape. Not a standing portrait.',
      'An athletic woman of 26 sits on a pale oak floor beside a tall window, one knee raised, looking outside.',
      'A plain cream cloth tape with no markings and no numbers lies loosely across her knee.',
      'Black training clothes. Cool morning light. The room is almost empty.',
      'Wide frame. She sits left of center. The window fills the right side. Her face is fully in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'progress-leave',
    file: 'progress-leave.webp',
    prompt: [
      'Premium campaign photograph, horizontal landscape. Not a mirror.',
      'An athletic man of 32 walks out of a private gym at dusk. We see him from a rear three-quarter angle so his face is visible in profile.',
      'A charcoal gym bag is on one shoulder. He wears a black t-shirt and training pants. His posture is upright and calm.',
      'The doorway is dark steel and glass. Outside is a cool grey street. A thin line of warm orange light sits on the door handle only.',
      'No mirror, no flex, no before-and-after. Wide frame. He walks through the left half and the doorway fills the right.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'intake-morning',
    file: 'intake-morning.webp',
    prompt: [
      'Premium lifestyle photograph, horizontal landscape.',
      'A woman of 27 with auburn hair sits at a stone kitchen island in the morning, about to leave for training.',
      'She looks out of frame to the side, not at the lens, one hand around a ceramic cup. A closed charcoal gym bag rests on the next stool.',
      'Off-white walls, oak, cool daylight. She wears a black knit top.',
      'Face fully in frame with space above the hair. No notebook, no screen, no text.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'plan-arrived',
    file: 'plan-arrived.webp',
    prompt: [
      'Premium photograph, horizontal landscape, camera just behind his shoulder.',
      'A lean man of 28 sits on a low oak bench after training. We see the side of his face and the back of the phone, so the screen is hidden.',
      'He looks down at the phone. Charcoal t-shirt. A towel on the bench.',
      'In front of him the private gym opens up: a rack, a tall window, cool light. He is not centered like a portrait.',
      'An orange bottle cap is on the floor. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'why-plan',
    file: 'why-plan.webp',
    prompt: [
      'Premium lifestyle photograph, horizontal landscape.',
      'A man of 32 with short black hair and medium-brown skin sits at a pale oak kitchen table in the morning.',
      'A closed charcoal notebook and a glass of water are on the table. No writing is visible. He looks toward the window, not at the lens.',
      'He wears a black t-shirt. Cool daylight. The kitchen is quiet and almost empty.',
      'Wide frame. He sits left of center. The table continues to the right. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'why-keeps',
    file: 'why-keeps.webp',
    prompt: [
      'Premium training photograph, horizontal landscape.',
      'A lean man of 34 with a short beard and fair skin sets one black dumbbell on the floor of a bright apartment.',
      'He is kneeling on one knee beside a tall window, looking at the dumbbell, not at the lens. Charcoal shorts and a black tank.',
      'No tape measure, no phone, no notebook. Cool morning light. Pale walls.',
      'Wide frame. He is left of center. The window and the empty floor run to the right. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'why-principles',
    file: 'why-principles.webp',
    prompt: [
      'Premium form photograph, horizontal landscape.',
      'An athletic woman of 29 with dark hair tied back holds one kettlebell in a careful hip hinge in an empty private studio.',
      'Side view. Her eyes are on the floor ahead, not on the lens. Spine long, both hands on the handle, five fingers visible.',
      'Black leggings and a charcoal tank. Soft north light. No mirrors, no other people, no text.',
      'Wide frame. She is left of center. The empty studio continues to the right. Her whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'why-work',
    file: 'why-work.webp',
    prompt: [
      'Premium gym photograph, horizontal landscape.',
      'A muscular but believable man of 30 with cropped hair stands still in front of a barbell already loaded on a low rack.',
      'He looks at the bar, not at the lens. Hands relaxed at his sides. Black t-shirt and shorts. The session is already set.',
      'Private studio, charcoal walls, one window of cool light. No phone, no whiteboard, no writing.',
      'Wide frame. He stands left of center. The loaded bar runs across the frame. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'method-work',
    file: 'method-work.webp',
    prompt: [
      'Premium training photograph, horizontal landscape.',
      'An athletic woman of 27 with a short black bob rows on a quiet indoor rowing machine in a private studio.',
      'Side view, mid-stroke. She looks down the rail, not at the lens. Charcoal tank and black shorts. Hands on the handle, correct grip.',
      'Cool window light, pale concrete floor, almost no equipment behind her.',
      'Wide frame. She is left of center. The rail continues to the right. Her whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'method-adapt',
    file: 'method-adapt.webp',
    prompt: [
      'Quiet editorial photograph, horizontal landscape.',
      'A man of 31 with wavy dark hair stands on a concrete balcony at dusk after training. A towel rests on one shoulder.',
      'He looks out at a cool grey city, not at the lens. Black t-shirt. No phone.',
      'The balcony railing is simple. A small orange plant pot sits far to the right, out of focus.',
      'Wide frame. He stands left of center. The skyline fills the right. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'fail-generic',
    file: 'fail-generic.webp',
    prompt: [
      'Premium editorial photograph, horizontal landscape.',
      'A tired man of 30 with short black hair stands in a crowded commercial gym that does not fit him.',
      'He holds a single blank sheet of paper with no readable writing, looking down at it, not at the lens.',
      'Around him are machines he is not using. Charcoal t-shirt, black shorts. The room is bright and impersonal.',
      'He is left of center. The machines continue across the right of the frame. His whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'fail-static',
    file: 'fail-static.webp',
    prompt: [
      'Premium editorial photograph, horizontal landscape.',
      'An athletic woman of 29 sits on the same gym bench she has used for months, elbows on her knees, looking at the floor.',
      'A closed blank notebook with no text lies beside her. Nothing in the room has changed.',
      'Black training clothes. Cool window light. She is not posing and not looking at the lens.',
      'She is left of center. The empty studio stretches to the right. Her whole head is in frame.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'fail-alone',
    file: 'fail-alone.webp',
    prompt: [
      'Premium editorial photograph, horizontal landscape.',
      'A man of 33 sits alone at a kitchen table at night. A closed folder and a phone face-down are in front of him. No other person is in the room.',
      'He looks out the dark window, not at the lens. Charcoal sweater. One small lamp. The rest of the apartment is quiet.',
      'He is left of center. The empty table runs to the right. His whole head is in frame. No readable text.',
      LOOK,
    ].join(' '),
  },
  {
    id: 'fail-guess',
    file: 'fail-guess.webp',
    prompt: [
      'Premium editorial photograph, horizontal landscape.',
      'A woman of 28 stands in her kitchen between an open fridge of ordinary food and a charcoal gym bag on the counter.',
      'One hand rests on the counter. She looks at neither the food nor the bag, just past them, unsure. Not at the lens.',
      'Black top. Cool daylight. Rice, greens, and eggs are visible, with no labels and no logos.',
      'She is left of center. The counter and the bag continue to the right. Her whole head is in frame.',
      LOOK,
    ].join(' '),
  },
]

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null
  const client = new OpenAI({ apiKey, timeout: 300_000, maxRetries: 1 })
  await mkdir(root, { recursive: true })

  for (const job of JOBS) {
    if (only && !only.includes(job.id)) continue
    process.stdout.write(`generate ${job.id}\n`)
    const response = await client.images.generate({
      model: MODEL,
      prompt: job.prompt,
      size: '1536x1024',
      n: 1,
      quality: 'high',
    } as never)
    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error(`no bytes for ${job.id}`)
    const webp = await sharp(Buffer.from(b64, 'base64')).rotate().webp({ quality: 86 }).toBuffer()
    await writeFile(path.join(root, job.file), webp)
    process.stdout.write(`wrote ${job.file} ${webp.length}\n`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'failed'}\n`)
  process.exit(1)
})
