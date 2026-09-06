/**
 * Remove the retired WELCOME60 / 60% OFF offer strip from the live theme.
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

function disableOfferJson(text) {
  try {
    const data = JSON.parse(text)
    const sections = data.sections ?? data
    for (const section of Object.values(sections || {})) {
      if (!section || typeof section !== 'object') continue
      const type = String(section.type || '')
      const settings = section.settings && typeof section.settings === 'object' ? section.settings : null
      const isOffer =
        /offer|welcome/i.test(type) ||
        (settings &&
          (String(settings.code || '') === 'WELCOME60' ||
            String(settings.discount_code || '') === 'WELCOME60' ||
            /60%\s*OFF/i.test(String(settings.offer_text || ''))))
      if (!isOffer || !settings) continue
      if ('enabled' in settings) settings.enabled = false
      if ('code' in settings && settings.code === 'WELCOME60') settings.code = ''
      if ('discount_code' in settings && settings.discount_code === 'WELCOME60') settings.discount_code = ''
      if ('offer_text' in settings) settings.offer_text = ''
      section.disabled = true
    }
    return JSON.stringify(data)
  } catch {
    return text
      .replace(/"code"\s*:\s*"WELCOME60"/g, '"code": ""')
      .replace(/"discount_code"\s*:\s*"WELCOME60"/g, '"discount_code": ""')
      .replace(/WELCOME60 for 60% OFF ENDS SOON/g, '')
      .replace(/&code=WELCOME60/g, '')
  }
}

function hideOfferLiquid(text) {
  if (!text.includes('lurvox-offer-strip') && !text.includes('WELCOME60')) return text
  const hide = `{% comment %} WELCOME60 retired — offer strip hidden {% endcomment %}
<style id="lurvox-hide-welcome60">
  .lurvox-offer-strip,
  #lurvox-offer-strip-home,
  #lurvox-offer-strip-live,
  aside.lurvox-offer-strip,
  .shopify-section-group-header-group .lurvox-offer-strip { display: none !important; }
</style>
`
  if (text.includes('lurvox-hide-welcome60')) return text
  return hide + text.replace(/{%-?\s*if section\.settings\.enabled\s*-?%}/g, '{% if false %}')
}

const files = []
const jsonKeys = [
  'sections/header-group.json',
  'templates/index.json',
  'templates/page.json',
]
for (const key of jsonKeys) {
  const live = await get(key)
  if (!live) {
    console.log('skip missing', key)
    continue
  }
  const patched = disableOfferJson(live)
  if (patched !== live) {
    files.push({ filename: key, body: { type: 'TEXT', value: patched } })
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

const liquidKeys = [
  'sections/lurvox-offer-home.liquid',
  'sections/lurvox-offer-strip.liquid',
  'sections/lurvox-client-login.liquid',
]
for (const key of liquidKeys) {
  const live = await get(key)
  if (!live) {
    console.log('skip missing', key)
    continue
  }
  const patched = hideOfferLiquid(live)
  if (patched !== live) {
    files.push({ filename: key, body: { type: 'TEXT', value: patched } })
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })

if (files.length === 1) {
  console.log('only cache-bust — still uploading layout')
}

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
