/**
 * Patch live lurvox.in to the human-coaching catalog: ₹1,999 / ₹3,499 / ₹5,999.
 * Edits the published theme in place. Does not upload local shopify-assets.
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
  throw new Error(`themes.json ${themeRes.status}`)
}
const main = themeJson.themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
const THEME = main.id
console.log('main', THEME, main.name)

async function get(key) {
  const res = await fetch(`${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

async function upsert(files) {
  if (!files.length) return
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
  console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
}

const PAIRS = [
  ['₹2,299', '₹5,999'],
  ['₹2,300', '₹5,999'],
  ['₹1,499', '₹3,499'],
  ['₹1,500', '₹3,499'],
  ['₹899', '₹1,999'],
  ['₹900', '₹1,999'],
  ['≈ ₹192/month', '≈ ₹500/month'],
  ['≈ ₹250/month', '≈ ₹583/month'],
  ['≈ ₹300/month', '≈ ₹666/month'],
  ['≈ ₹192/mo', '≈ ₹500/mo'],
  ['≈ ₹250/mo', '≈ ₹583/mo'],
  ['≈ ₹300/mo', '≈ ₹666/mo'],
  ['₹192 a month', '₹500 a month'],
  ['₹250 a month', '₹583 a month'],
  ['₹300 a month', '₹666 a month'],
  ['from ₹192/mo', 'from ₹500/mo'],
  ['Save ₹1,301', 'Save ₹1,997'],
  ['Save ₹301', 'Save ₹499'],
  ['₹1,301', '₹1,997'],
  ['₹301', '₹499'],
  ['data-value="2299"', 'data-value="5999"'],
  ['data-value="2300"', 'data-value="5999"'],
  ['data-value="1499"', 'data-value="3499"'],
  ['data-value="1500"', 'data-value="3499"'],
  ['data-value="899"', 'data-value="1999"'],
  ['data-value="900"', 'data-value="1999"'],
]

function patchPrices(text) {
  let next = text
    .replace(/"plan_2_price": "[^"]+"/g, '"plan_2_price": "1999"')
    .replace(/"plan_3_price": "[^"]+"/g, '"plan_3_price": "3499"')
    .replace(/"plan_4_price": "[^"]+"/g, '"plan_4_price": "5999"')
    .replace(/"plan_2_monthly": "[^"]*"/g, '"plan_2_monthly": "≈ ₹666/month"')
    .replace(/"plan_3_monthly": "[^"]*"/g, '"plan_3_monthly": "≈ ₹583/month"')
    .replace(/"plan_4_monthly": "[^"]*"/g, '"plan_4_monthly": "≈ ₹500/month"')
    .replace(/"col_1_price": "₹[^"]*"/g, '"col_1_price": "₹1,999"')
    .replace(/"col_2_price": "₹[^"]*"/g, '"col_2_price": "₹3,499"')
    .replace(/"col_3_price": "₹[^"]*"/g, '"col_3_price": "₹5,999"')
  for (const [from, to] of PAIRS) next = next.split(from).join(to)
  return next
}

const listed = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  headers: { 'X-Shopify-Access-Token': token },
})
const assetJson = await listed.json()
const keys = (assetJson.assets || [])
  .map((a) => a.key)
  .filter((key) => /\.(liquid|json|js)$/.test(key))
  .filter((key) => !key.startsWith('locales/'))
  .filter((key) => /lurvox|templates\/|blocks\/ai_gen|config\/settings_data|layout\/theme/.test(key))

for (const key of keys) {
  const live = await get(key)
  if (!live) continue
  const patched = patchPrices(live)
  if (patched === live) continue
  await upsert([{ filename: key, body: { type: 'TEXT', value: patched } }])
  console.log('patched', key)
}

let layout = await get('layout/theme.liquid')
if (layout) {
  const stamp = Date.now()
  layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
    ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
    : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  await upsert([{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }])
}

const pages = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ query: `{ pages(first: 80) { nodes { id handle body } } }` }),
}).then((r) => r.json())
for (const page of pages.data?.pages?.nodes || []) {
  const body = page.body || ''
  const next = patchPrices(body)
  if (!body || next === body) continue
  const updated = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      query: `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { handle }
          userErrors { field message }
        }
      }`,
      variables: { id: page.id, page: { body: next } },
    }),
  }).then((r) => r.json())
  if (updated.data?.pageUpdate?.userErrors?.length) {
    throw new Error(`${page.handle}: ${JSON.stringify(updated.data.pageUpdate.userErrors)}`)
  }
  console.log('patched page', page.handle)
}

console.log('live catalog now ₹1,999 / ₹3,499 / ₹5,999')
