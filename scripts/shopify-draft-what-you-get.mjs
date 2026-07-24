/**
 * 1) Duplicate current MAIN Shopify theme to a draft copy
 * 2) Move "What you get" under transformation photos
 * 3) Refresh sale-focused copy: exactly what customers get + what happens after payment
 *
 * Auth: node scripts/shopify-pkce-auth.mjs (token at %TEMP%/shopify-auth-token.json)
 * Run:  node scripts/shopify-draft-what-you-get.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

function findBlockEntry(section, typePrefix) {
  for (const [key, block] of Object.entries(section.blocks || {})) {
    if (block?.type === typePrefix || key.startsWith(typePrefix)) return { key, block }
  }
  return null
}

const themes = await gql(`{ themes(first: 25) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')

const draftMetaPath = path.join(process.env.TEMP, 'shopify-draft-theme.json')
let draft = null
if (fs.existsSync(draftMetaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(draftMetaPath, 'utf8'))
    const existing = themes.themes.nodes.find((t) => t.id === meta.draftThemeId)
    if (existing) {
      draft = existing
      console.log('Reusing draft theme:', draft.name, draft.id)
    }
  } catch {
    // create fresh below
  }
}

if (!draft) {
  const draftName = `LURVOX Sale Focus ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const dup = await gql(
    `mutation themeDuplicate($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: main.id, name: draftName }
  )
  if (dup.themeDuplicate.userErrors?.length) {
    throw new Error(JSON.stringify(dup.themeDuplicate.userErrors, null, 2))
  }
  draft = dup.themeDuplicate.newTheme
  console.log('Created draft theme:', draft.name, draft.id)
}

fs.writeFileSync(
  draftMetaPath,
  JSON.stringify(
    {
      draftThemeId: draft.id,
      draftThemeName: draft.name,
      mainThemeId: main.id,
      createdAt: new Date().toISOString(),
    },
    null,
    2
  )
)

// Always read from MAIN (reliable), then write the edited homepage to the draft copy.
const fileData = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: main.id, filenames: ['templates/index.json'] }
)

const raw = fileData.theme.files.nodes[0]?.body?.content
if (!raw) throw new Error('templates/index.json missing on MAIN theme')
const index = JSON.parse(stripAutoHeader(raw))

const contentSection = index.sections?.blocks_C9E4qf
if (!contentSection?.block_order) throw new Error('Homepage content section blocks_C9E4qf not found')

const photos = findBlockEntry(contentSection, 'ai_gen_block_cd3c949')
const whatYouGet = findBlockEntry(contentSection, 'ai_gen_block_68d702b')
if (!photos || !whatYouGet) {
  throw new Error('Missing transformation photos or What you get block')
}

// Place What you get immediately after transformation photos
const order = contentSection.block_order.filter((id) => id !== whatYouGet.key)
const photoIdx = order.indexOf(photos.key)
if (photoIdx < 0) throw new Error('Photos block missing from block_order')
order.splice(photoIdx + 1, 0, whatYouGet.key)
contentSection.block_order = order

Object.assign(whatYouGet.block.settings, {
  eyebrow_text: 'AFTER YOU PAY — HERE IS EXACTLY WHAT HAPPENS',
  headline: 'What you get. No guesswork.',
  paragraph:
    'You are not buying a PDF.\nYou get a personal coach, a personal plan, and a system that keeps updating with you.',
  highlight_text:
    'Checkout → create login → assessment + photos → personal diet & workout in 24–48 hours → daily trackers + coach chat → weekly check-ins → plan updates.',
  card_1_title: 'DAY 1 ACCESS',
  card_1_item_1_title: 'Instant account setup',
  card_1_item_1_description:
    'Pay once, create your login, and enter the client app the same day.',
  card_1_item_2_title: 'Onboarding assessment',
  card_1_item_2_description:
    'Goals, schedule, diet prefs, injuries, and progress photos so coaching starts personal.',
  card_1_item_3_title: 'Coach assigned',
  card_1_item_3_description:
    'A real coach owns your case — not a chatbot, not a random template.',
  card_2_title: 'YOUR PERSONAL PLAN',
  card_2_item_1_title: 'Custom workout plan',
  card_2_item_1_description:
    'Built for gym, home, or both — matched to your experience and equipment.',
  card_2_item_2_title: 'Custom diet plan',
  card_2_item_2_description:
    'Meals and macros around your preferences, allergies, and real life. Veg/vegan friendly.',
  card_2_item_3_title: 'Delivered in 24–48 hours',
  card_2_item_3_description:
    'After onboarding, your first diet + workout lands fast so you can start training.',
  card_3_title: 'EVERY WEEK SUPPORT',
  card_3_item_1_title: 'Weekly check-ins',
  card_3_item_1_description:
    'Photos, measurements, adherence, and recovery reviewed by your coach.',
  card_3_item_2_title: 'Plan updates from real data',
  card_3_item_2_description:
    'Training and nutrition adjust from what you actually do — not a static month-1 PDF.',
  card_3_item_3_title: 'Direct coach chat',
  card_3_item_3_description:
    'Ask questions inside the app when form, hunger, travel, or schedule changes.',
  card_4_title: 'TOOLS THAT KEEP YOU CONSISTENT',
  card_4_item_1_title: 'Daily trackers',
  card_4_item_1_description:
    'Workout, diet, water, sleep, steps, supplements, and habits in one place.',
  card_4_item_2_title: 'Journey + progress photos',
  card_4_item_2_description:
    'See your timeline, before/after photos, and coaching history as proof of progress.',
  card_4_item_3_title: 'Consistency League',
  card_4_item_3_description:
    'Optional monthly ladder with your coach’s squad — stay accountable and climb ranks.',
})

// Soften FAQ answer_1/2 to match the sale story if present
const faq = findBlockEntry(contentSection, 'ai_gen_block_66d8696')
if (faq?.block?.settings) {
  Object.assign(faq.block.settings, {
    question_1: 'WHAT HAPPENS AFTER I PAY?',
    answer_1:
      'You create your account, finish a short assessment with progress photos, and get a personal workout + diet within 24–48 hours. Then you use daily trackers, message your coach, submit weekly check-ins, and receive plan updates based on your real progress.',
    question_2: 'WHAT EXACTLY IS INCLUDED?',
    answer_2:
      'Personal workout, personal diet, weekly coach check-ins, daily trackers, coach chat, progress photos/journey, and weekly plan updates. One price — no separate upsell for core coaching.',
  })
}

const nextJson = JSON.stringify(index, null, 2)
fs.writeFileSync(path.join('scripts', 'tmp-draft-what-you-get-index.json'), nextJson)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: draft.id,
    files: [{ filename: 'templates/index.json', body: { type: 'TEXT', value: nextJson } }],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log(
  JSON.stringify(
    {
      ok: true,
      draftThemeId: draft.id,
      draftThemeName: draft.name,
      mainThemeId: main.id,
      note: 'Preview the draft in Shopify Admin → Themes. Publish when ready.',
      moved: 'What you get now sits directly under transformation photos',
    },
    null,
    2
  )
)
