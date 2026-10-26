/**
 * Ship the catalog homepage + simple coach form to the live Shopify theme.
 * Preview7 already applies the same transforms in Next.js.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOP = '9uwyq1-0j.myshopify.com'
const REST = `https://${SHOP}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP || process.env.TMP || '', 'shopify-auth-token.json')
const HERO_FROM = 'Start in 90 days'
const HERO_TO = 'Start the journey within 24 hours'

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

loadEnvLocal()

const tokenFile = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')) : {}
const headers = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token || '',
  'Content-Type': 'application/json',
}

async function refreshUserToken() {
  if (!tokenFile.refresh_token) return false
  const refresh = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (!refresh.ok) return false
  Object.assign(tokenFile, await refresh.json())
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  headers['X-Shopify-Access-Token'] = tokenFile.access_token
  return true
}

async function mintClientCredentials() {
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) return false
  const minted = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const mintedJson = await minted.json().catch(() => ({}))
  if (!minted.ok || !mintedJson.access_token) return false
  headers['X-Shopify-Access-Token'] = mintedJson.access_token
  return true
}

async function themesJson() {
  return fetch(`${REST}/themes.json`, {
    headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] },
  })
}

let themeRes = await themesJson()
if (themeRes.status === 401 && (await refreshUserToken())) themeRes = await themesJson()
if (themeRes.status === 401 && (await mintClientCredentials())) themeRes = await themesJson()

const themeJson = await themeRes.json()
if (!themeRes.ok || !Array.isArray(themeJson.themes)) {
  throw new Error(`themes.json ${themeRes.status}. Re-auth: node scripts/shopify-pkce-auth.mjs`)
}
const main = themeJson.themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] } },
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

function rewriteHeroCopy(value) {
  if (typeof value !== 'string') return value
  return value.replaceAll(`${HERO_FROM}.`, `${HERO_TO}.`).replaceAll(HERO_FROM, HERO_TO)
}

function patchIndex(raw) {
  const data = JSON.parse(raw)
  const section =
    data.sections?.home_blocks_v2 ||
    Object.values(data.sections || {}).find(
      (item) => item?.block_order && (item.blocks?.lurvox_what_you_get || item.blocks?.lurvox_plans_anchor),
    )
  if (!section?.block_order) throw new Error('homepage block_order missing')

  for (const block of Object.values(section.blocks || {})) {
    if (!block?.settings) continue
    for (const [key, value] of Object.entries(block.settings)) {
      if (typeof value === 'string' && value.includes(HERO_FROM)) {
        block.settings[key] = rewriteHeroCopy(value)
      }
    }
  }

  const order = [...section.block_order]
  const planId = Object.entries(section.blocks || {}).find(([, block]) => block.type === 'ai_gen_block_361650c')?.[0]
  const moving = ['lurvox_home_find_cta', 'lurvox_plans_anchor', planId, 'lurvox_home_after_plans', 'lurvox_what_you_get'].filter(
    (id) => id && order.includes(id),
  )
  const rest = order.filter((id) => !moving.includes(id))
  const next = rest.length ? [rest[0]] : []
  for (const id of moving) next.push(id)
  for (const id of rest.slice(1)) next.push(id)
  section.block_order = next

  const contactId = Object.entries(section.blocks || {}).find(
    ([id, block]) => block.type === 'contact_form' || /contact_form/i.test(id),
  )?.[0]
  if (contactId && section.blocks[contactId]) {
    section.blocks[contactId].disabled = true
  }

  const transformId = Object.entries(section.blocks || {}).find(
    ([id, block]) => block.type === 'ai_gen_block_cd3c949' || /cd3c949/i.test(id),
  )?.[0]
  if (transformId && section.blocks[transformId]) {
    section.blocks[transformId].disabled = true
  }

  return JSON.stringify(data)
}

function injectCatalogSnippet(layout) {
  if (layout.includes("render 'lurvox-catalog-home'") || layout.includes('render "lurvox-catalog-home"')) {
    return layout
  }
  if (/<\/body>/i.test(layout)) {
    return layout.replace(/<\/body>/i, "{% render 'lurvox-catalog-home' %}\n</body>")
  }
  return `${layout}\n{% render 'lurvox-catalog-home' %}\n`
}

let index = patchIndex(await get('templates/index.json'))
let layout = await get('layout/theme.liquid')
const stamp = Date.now()
layout = injectCatalogSnippet(layout)
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  {
    filename: 'sections/lurvox-plan-finder.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'), 'utf8'),
    },
  },
  {
    filename: 'snippets/lurvox-home-quiz.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-home-quiz.liquid'), 'utf8'),
    },
  },
  {
    filename: 'snippets/lurvox-catalog-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-catalog-home.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/lurvox-talk-to-coach.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'), 'utf8'),
    },
  },
  { filename: 'templates/index.json', body: { type: 'TEXT', value: index } },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const res = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${main.id}`, files },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}

const parsed = JSON.parse(index)
const home = parsed.sections.home_blocks_v2 || {}
console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('block_order', home.block_order)
console.log('home', `https://www.lurvox.in/?v=${stamp}`)
console.log('talk', `https://www.lurvox.in/pages/talk-to-a-coach?v=${stamp}`)
