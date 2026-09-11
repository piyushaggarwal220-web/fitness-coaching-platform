/**
 * Live theme: Talk-first dock, plan prices on choose-plan copy.
 * Writes theme 162252554491 (currently MAIN). Does not publish a different theme.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokenFile.refresh_token,
  }),
})
if (refresh.ok) {
  Object.assign(tokenFile, JSON.parse(await refresh.text()))
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
}

const token = tokenFile.access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function restGet(url) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } })
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
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

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const themes = (await restGet(`${REST}/themes.json`)).themes ?? []
const LIVE_FORMER_DRAFT = 162252554491
const matches = themes.filter((theme) => theme.id === LIVE_FORMER_DRAFT)
const draft = matches[0]
if (!draft) {
  console.error(`TARGET_NOT_FOUND: ${LIVE_FORMER_DRAFT}`)
  process.exit(1)
}
console.log(`Using ${draft.id} (${draft.role}) ${draft.name}`)

let layout = (
  await restGet(
    `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
).asset?.value
if (!layout) throw new Error('layout/theme.liquid missing')

const floatTag = "{% render 'lurvox-find-float' %}"
if (!layout.includes('lurvox-find-float')) {
  layout = layout.replace('</body>', `  ${floatTag}\n</body>`)
}

const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const PLAN_PRICES =
  'Fat loss · 90 days · ₹1,999. Fat loss + muscle gain · 6 months · ₹3,499. Athletic body · 12 months · ₹5,999.'

function patchPlanPrices(node) {
  if (!node || typeof node !== 'object') return
  if (node.settings && typeof node.settings.subheadline === 'string') {
    const text = node.settings.subheadline
    if (/90 days/i.test(text) && /Athletic body|12 months/i.test(text)) {
      node.settings.subheadline = PLAN_PRICES
    }
  }
  if (node.settings && typeof node.settings.subheading === 'string') {
    const text = node.settings.subheading
    if (/plan|quiz|Fat loss|goal/i.test(text) && !/₹1,999/.test(text)) {
      node.settings.subheading =
        'Fat loss ₹1,999 · Fat loss + muscle ₹3,499 · Athletic body ₹5,999. Answer honestly — we send you to that plan page. No payment here.'
    }
  }
  for (const value of Object.values(node)) patchPlanPrices(value)
}

async function themeJson(filename) {
  try {
    const asset = (
      await restGet(
        `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent(filename)}`
      )
    ).asset?.value
    return asset ? JSON.parse(asset) : null
  } catch {
    return null
  }
}

const indexJson = await themeJson('templates/index.json')
if (indexJson) patchPlanPrices(indexJson)

const chooseJson = await themeJson('templates/page.choose-your-plan.json')
if (chooseJson) patchPlanPrices(chooseJson)

const files = [
  {
    filename: 'snippets/lurvox-find-float.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-find-float.liquid') },
  },
  {
    filename: 'snippets/lurvox-conversion-boost.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid') },
  },
  {
    filename: 'snippets/lurvox-sales-closer.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-sales-closer.liquid') },
  },
  {
    filename: 'snippets/lurvox-home-flow.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-home-flow.liquid') },
  },
  {
    filename: 'sections/lurvox-landing-hero.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-landing-hero.liquid') },
  },
  {
    filename: 'sections/lurvox-talk-to-coach.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid') },
  },
  {
    filename: 'sections/lurvox-plan-finder-v3.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-plan-finder-v3.liquid') },
  },
  {
    filename: 'blocks/ai_gen_block_52353f6.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid') },
  },
  {
    filename: 'templates/page.find-your-plan.json',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/templates-page.find-your-plan.json') },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

if (indexJson) {
  files.push({
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: JSON.stringify(indexJson) },
  })
}
if (chooseJson) {
  files.push({
    filename: 'templates/page.choose-your-plan.json',
    body: { type: 'TEXT', value: JSON.stringify(chooseJson) },
  })
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

console.log('Uploaded', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
console.log('Live theme', draft.id, draft.role, 'https://www.lurvox.in/?v=' + stamp)
