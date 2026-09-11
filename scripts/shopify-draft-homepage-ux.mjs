/**
 * Draft-only homepage UX: demo card, FAQ accordion, client login rail.
 * NEVER publishes. NEVER writes to MAIN (Live quiz-v3).
 *
 * Auth: node scripts/shopify-pkce-auth.mjs
 * Run:  node scripts/shopify-draft-homepage-ux.mjs
 * FAQ CSS only: node scripts/shopify-draft-homepage-ux.mjs --faq-only
 * Header login only: node scripts/shopify-draft-homepage-ux.mjs --login-only
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FAQ_ONLY = process.argv.includes('--faq-only')
const LOGIN_ONLY = process.argv.includes('--login-only')
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const SITE = 'https://www.lurvox.in'
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const MAIN_NAME = 'Live quiz-v3 2026-08-26 18:09'
const PREFERRED_ID = 162252554491
const FAQ_BLOCK = 'ai_gen_block_66d8696_yVRepa'
const LOGIN_URL = 'https://app.lurvox.in/login'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

const localFiles = {
  landingHero: path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-landing-hero.liquid'),
  faqSnippet: path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-home-faq.liquid'),
  whatYouGet: path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'),
  offerHome: path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-offer-home.liquid'),
  clientLogin: path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-client-login.liquid'),
  headerMatch: path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-header-match.liquid'),
}

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
for (const [name, filePath] of Object.entries(localFiles)) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${name}: ${filePath}`)
    process.exit(1)
  }
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

const main = themes.find((theme) => theme.role === 'main')
if (main) {
  console.log(`Live MAIN is ${main.id} (${main.name}) — will not write to it.`)
}

const matches = themes
  .filter((theme) => theme.name.trim() === TARGET_NAME && theme.role !== 'main')
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
let draft = matches.find((theme) => theme.id === PREFERRED_ID) || matches[0]
if (!draft) {
  console.error(`TARGET_NOT_FOUND: ${TARGET_NAME}`)
  process.exit(1)
}
if (draft.role === 'main' || draft.name.trim() === MAIN_NAME) {
  console.error('REFUSING: target theme is MAIN / live. Will not write.')
  process.exit(1)
}
if (draft.id !== PREFERRED_ID) {
  console.log(`Preferred id ${PREFERRED_ID} not used; newest unpublished copy is ${draft.id}`)
}

console.log(`Using unpublished draft ${draft.id} (${draft.role}) ${draft.name}`)

async function bustLayout() {
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
  return layout
}

async function upsertFiles(files) {
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
  return upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
}

if (LOGIN_ONLY) {
  const layout = await bustLayout()
  const files = [
    {
      filename: 'snippets/lurvox-header-match.liquid',
      body: { type: 'TEXT', value: fs.readFileSync(localFiles.headerMatch, 'utf8') },
    },
    {
      filename: 'sections/lurvox-client-login.liquid',
      body: { type: 'TEXT', value: fs.readFileSync(localFiles.clientLogin, 'utf8') },
    },
    {
      filename: 'sections/lurvox-offer-home.liquid',
      body: { type: 'TEXT', value: fs.readFileSync(localFiles.offerHome, 'utf8') },
    },
  ]
  if (layout) {
    files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })
  }
  const names = await upsertFiles(files)
  console.log('Login-only upload', names.join(', '))
  console.log('NOT published. Preview:', `${SITE}/?preview_theme_id=${draft.id}`)
  process.exit(0)
}

if (FAQ_ONLY) {
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
      filename: 'snippets/lurvox-home-faq.liquid',
      body: { type: 'TEXT', value: fs.readFileSync(localFiles.faqSnippet, 'utf8') },
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
  console.log('FAQ-only upload', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
  console.log('NOT published. Preview:', previewUrl)
  process.exit(0)
}

const indexRes = await restGet(
  `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`
)
const index = JSON.parse(indexRes.asset.value)
const home = index.sections?.home_blocks_v2
if (!home?.blocks) throw new Error('home_blocks_v2 missing on this draft')

if (home.blocks[FAQ_BLOCK]) {
  home.blocks[FAQ_BLOCK].disabled = true
}

home.blocks.lurvox_home_faq = {
  type: 'custom-liquid',
  settings: {
    custom_liquid: "{% render 'lurvox-home-faq' %}",
  },
}

home.block_order = (home.block_order || []).filter((id) => id !== 'lurvox_home_faq')
const faqIdx = home.block_order.indexOf(FAQ_BLOCK)
if (faqIdx >= 0) {
  home.block_order.splice(faqIdx, 0, 'lurvox_home_faq')
} else {
  const closerIdx = home.block_order.indexOf('lurvox_sales_closer')
  home.block_order.splice(closerIdx >= 0 ? closerIdx : home.block_order.length, 0, 'lurvox_home_faq')
}

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

const galleryId = 'lurvox_home_gallery'
const heroId = 'lurvox_landing_hero'
if (Array.isArray(index.order)) {
  const galleryPos = index.order.indexOf(galleryId)
  const heroPos = index.order.indexOf(heroId)
  if (galleryPos >= 0 && heroPos >= 0 && heroPos < galleryPos) {
    index.order = index.order.filter((id) => id !== heroId)
    index.order.splice(index.order.indexOf(galleryId) + 1, 0, heroId)
  }
}

const hgRes = await restGet(
  `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('sections/header-group.json')}`
)
const hg = JSON.parse(hgRes.asset.value)
hg.sections.lurvox_client_login = {
  type: 'lurvox-client-login',
  settings: {
    enabled: true,
    homepage_only: false,
    prompt: 'Already a client?',
    label: 'Log in',
    login_url: LOGIN_URL,
    accent_color: '#FF6200',
  },
}
hg.order = (hg.order || []).filter((id) => id !== 'lurvox_client_login')
const afterIdx = hg.order.findIndex((id) => {
  const t = hg.sections[id]?.type || ''
  return /announcement|offer/i.test(t) || /announcement|offer/i.test(id)
})
hg.order.splice(afterIdx >= 0 ? afterIdx + 1 : 0, 0, 'lurvox_client_login')

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
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.landingHero, 'utf8') },
  },
  {
    filename: 'snippets/lurvox-home-faq.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.faqSnippet, 'utf8') },
  },
  {
    filename: 'snippets/lurvox-what-you-get.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.whatYouGet, 'utf8') },
  },
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.offerHome, 'utf8') },
  },
  {
    filename: 'sections/lurvox-client-login.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.clientLogin, 'utf8') },
  },
  {
    filename: 'snippets/lurvox-header-match.liquid',
    body: { type: 'TEXT', value: fs.readFileSync(localFiles.headerMatch, 'utf8') },
  },
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
  {
    filename: 'sections/header-group.json',
    body: { type: 'TEXT', value: `${JSON.stringify(hg, null, 2)}\n` },
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
console.log('header order', hg.order.join(' → '))
console.log('home FAQ order includes', home.block_order.filter((id) => /faq/i.test(id)).join(', '))
console.log('NOT published. Preview:', previewUrl)
