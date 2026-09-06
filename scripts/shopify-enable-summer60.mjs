/**
 * Put SUMMER60 back on the live offer strip. WELCOME60 stays retired.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const token =
  process.env.SHOPIFY_ACCESS_TOKEN ||
  (fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token : null)
if (!token) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themeRes = await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
const themeJson = await themeRes.json()
if (!themeRes.ok || !Array.isArray(themeJson.themes)) {
  throw new Error(`themes.json ${themeRes.status}: ${JSON.stringify(themeJson.errors || themeJson)}`)
}
const main = themeJson.themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
const THEME = main.id
console.log('main', THEME, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

function enableOfferJson(text) {
  const data = JSON.parse(text)
  const sections = data.sections ?? data
  for (const section of Object.values(sections || {})) {
    if (!section || typeof section !== 'object') continue
    const type = String(section.type || '')
    const settings = section.settings && typeof section.settings === 'object' ? section.settings : null
    const isOffer = /offer/i.test(type)
    if (!isOffer || !settings) continue
    settings.enabled = true
    settings.code = 'SUMMER60'
    if ('offer_text' in settings) settings.offer_text = '60% OFF coaching plans'
    if ('discount_code' in settings) settings.discount_code = 'SUMMER60'
    section.disabled = false
  }
  return JSON.stringify(data)
}

function restoreOfferLiquid(text) {
  let next = text
    .replace(/<style id="lurvox-hide-welcome60">[\s\S]*?<\/style>\s*/g, '')
    .replace(/\{%\s*comment\s*%\}\s*WELCOME60 retired[\s\S]*?\{%\s*endcomment\s*%\}\s*/g, '')
    .replace(/\{%\s*if false\s*%\}/g, '{% if section.settings.enabled %}')
    .replace(/WELCOME60/g, 'SUMMER60')
    .replace(/default: 'WELCOME60'/g, "default: 'SUMMER60'")
  return next
}

const files = []
for (const key of ['sections/header-group.json', 'templates/index.json']) {
  const live = await get(key)
  if (!live) continue
  const patched = enableOfferJson(live)
  if (patched !== live) {
    files.push({ filename: key, body: { type: 'TEXT', value: patched } })
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

const offer = await get('sections/lurvox-offer-home.liquid')
if (offer) {
  const patched = restoreOfferLiquid(offer)
  files.push({ filename: 'sections/lurvox-offer-home.liquid', body: { type: 'TEXT', value: patched } })
  console.log('patched sections/lurvox-offer-home.liquid')
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })

const res = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${THEME}`, files },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('home', `https://www.lurvox.in/?v=${stamp}`)
