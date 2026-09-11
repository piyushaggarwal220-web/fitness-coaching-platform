/**
 * Find unpublished theme "Copy of Live quiz-v3 2026-08-26 18:09"
 * and keep the fitness-gallery carousel above the landing welcome.
 * NEVER publishes. NEVER writes to MAIN.
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-draft-landing-hero.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const SITE = 'https://www.lurvox.in'
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const GALLERY_BLOCK = 'ai_gen_block_52353f6_MmHVRV'
const SCROLL_BLOCK = 'ai_gen_block_3ba2481_yhYwEt'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const sectionPath = path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-landing-hero.liquid')

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
if (!fs.existsSync(sectionPath)) {
  console.error('Missing landing hero liquid')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function restGet(url) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } })
  if (!res.ok) throw new Error(`GET ${url} ${res.status} ${await res.text()}`)
  return res.json()
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const themesJson = await restGet(`${REST}/themes.json`)
const themes = themesJson.themes ?? []
console.log('Themes:')
for (const theme of themes) {
  console.log(`  ${theme.id}  ${theme.role.padEnd(12)}  ${theme.name}`)
}

const matches = themes
  .filter((theme) => theme.name.trim() === TARGET_NAME && theme.role !== 'main')
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
const draft = matches[0]
if (!draft) {
  console.error(`TARGET_NOT_FOUND: ${TARGET_NAME}`)
  process.exit(1)
}
if (matches.length > 1) {
  console.log(
    `Found ${matches.length} unpublished copies; using newest created ${draft.id}`
  )
}
if (draft.role === 'main') {
  console.error('REFUSING: target theme is MAIN / live. Will not write.')
  process.exit(1)
}

console.log(`Using unpublished draft ${draft.id} (${draft.role})`)

const indexRes = await restGet(
  `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`
)
const index = JSON.parse(indexRes.asset.value)
const home = index.sections?.home_blocks_v2
if (!home?.blocks) throw new Error('home_blocks_v2 missing on this draft')

if (home.blocks[SCROLL_BLOCK]) {
  home.blocks[SCROLL_BLOCK].disabled = true
}

const PLANS_BLOCK = 'ai_gen_block_361650c_qqYKXh'
const PLANS_ANCHOR = 'lurvox_plans_anchor'
const GALLERY_SECTION = 'lurvox_home_gallery'
const existingGallery =
  home.blocks[GALLERY_BLOCK] ||
  index.sections[GALLERY_SECTION]?.blocks?.[GALLERY_BLOCK]

if (existingGallery) {
  delete existingGallery.disabled
  delete home.blocks[GALLERY_BLOCK]
  index.sections[GALLERY_SECTION] = {
    type: '_blocks',
    name: 'Fitness gallery',
    blocks: {
      [GALLERY_BLOCK]: existingGallery,
    },
    block_order: [GALLERY_BLOCK],
    settings: {
      content_direction: 'column',
      vertical_on_mobile: true,
      horizontal_alignment: 'flex-start',
      vertical_alignment: 'center',
      align_baseline: false,
      horizontal_alignment_flex_direction_column: 'center',
      vertical_alignment_flex_direction_column: 'center',
      gap: 12,
      section_width: 'full-width',
      section_height: '',
      section_height_custom: 50,
      color_scheme: 'scheme-1',
      background_media: 'none',
      video_position: 'cover',
      background_image_position: 'cover',
      border: 'none',
      border_width: 1,
      border_opacity: 100,
      border_radius: 0,
      toggle_overlay: false,
      overlay_color: '#00000026',
      overlay_style: 'solid',
      gradient_direction: 'to top',
      'padding-block-start': 0,
      'padding-block-end': 0,
    },
  }
}

home.block_order = (home.block_order || []).filter(
  (id) => id !== GALLERY_BLOCK && id !== SCROLL_BLOCK
)
const front = [PLANS_ANCHOR, PLANS_BLOCK].filter((id) => home.blocks[id])
home.block_order = [
  ...front,
  ...home.block_order.filter((id) => !front.includes(id)),
]

index.sections.lurvox_landing_hero = {
  type: 'lurvox-landing-hero',
  settings: {
    headline: 'Try the app',
    lede: 'See a live coaching plan before you pay.',
    demo_enabled: true,
    demo_ask: 'No signup. Look around first.',
    demo_label: 'Try the platform free',
    demo_url: 'https://app.lurvox.in/try',
    call_enabled: true,
    call_label: 'Book a free call',
    call_url: '/pages/talk-to-a-coach',
    accent_color: '#ff6200',
  },
}

const pin = ['lurvox_offer_home', 'lurvox_tap_force_1785954197680'].filter(
  (id) => index.sections[id]
)
index.order = [
  ...pin,
  GALLERY_SECTION,
  'lurvox_landing_hero',
  'home_blocks_v2',
  ...index.order.filter(
    (id) =>
      !pin.includes(id) &&
      id !== GALLERY_SECTION &&
      id !== 'lurvox_landing_hero' &&
      id !== 'home_blocks_v2'
  ),
]

let layoutRes
try {
  layoutRes = await restGet(
    `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
} catch {
  layoutRes = null
}
let layout = layoutRes?.asset?.value ?? null
if (layout) {
  const stamp = Date.now()
  if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
    layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  } else {
    layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  }
}

const files = [
  {
    filename: 'sections/lurvox-landing-hero.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(sectionPath, 'utf8') },
  },
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
]
if (layout) {
  files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${draft.id}`,
    files,
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

const previewUrl = `${SITE}/?preview_theme_id=${draft.id}`
fs.writeFileSync(
  path.join(process.env.TEMP, 'shopify-quiz-v3-draft.json'),
  JSON.stringify(
    {
      draftThemeId: `gid://shopify/OnlineStoreTheme/${draft.id}`,
      draftThemeName: draft.name,
      role: draft.role,
      previewUrl,
      published: false,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  )
)

console.log('Uploaded', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
console.log('NOT published. Preview:', previewUrl)
