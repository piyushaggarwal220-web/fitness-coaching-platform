/**
 * Deploy plan prices to the live storefront: ₹900 / ₹1,500 / ₹2,300
 * (monthly ₹300 / ₹250 / ₹192).
 * Patches price strings on the live theme. Does not rewrite unrelated copy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const token =
  process.env.SHOPIFY_ACCESS_TOKEN ||
  (fs.existsSync(tokenPath)
    ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token
    : null)
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
const themes = themeJson.themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
const THEME = main.id
console.log('main', THEME, main.name)

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

const PAIRS = [
  ['₹5,999', '₹2,300'],
  ['₹3,499', '₹1,500'],
  ['₹1,999', '₹900'],
  ['from ₹500/mo', 'from ₹192/mo'],
  ['≈ ₹666/month', '≈ ₹300/month'],
  ['≈ ₹583/month', '≈ ₹250/month'],
  ['≈ ₹500/month', '≈ ₹192/month'],
  ['≈ ₹666/mo', '≈ ₹300/mo'],
  ['≈ ₹583/mo', '≈ ₹250/mo'],
  ['≈ ₹500/mo', '≈ ₹192/mo'],
  ['₹666 a month', '₹300 a month'],
  ['₹583 a month', '₹250 a month'],
  ['₹500 a month', '₹192 a month'],
  ['₹666/mo', '₹300/mo'],
  ['₹583/mo', '₹250/mo'],
  ['₹500/mo', '₹192/mo'],
  ['data-value="5999"', 'data-value="2300"'],
  ['data-value="3499"', 'data-value="1500"'],
  ['data-value="1999"', 'data-value="900"'],
  ['listPaise: 599900', 'listPaise: 230000'],
  ['salePaise: 599900', 'salePaise: 230000'],
  ['listPaise: 349900', 'listPaise: 150000'],
  ['salePaise: 349900', 'salePaise: 150000'],
  ['listPaise: 199900', 'listPaise: 90000'],
  ['salePaise: 199900', 'salePaise: 90000'],
  ['"default": "5999"', '"default": "2300"'],
  ['"default": "3499"', '"default": "1500"'],
  ['"default": "1999"', '"default": "900"'],
  ["strongs[0].textContent = '₹1,999'", "strongs[0].textContent = '₹900'"],
  ["strongs[1].textContent = '₹3,499'", "strongs[1].textContent = '₹1,500'"],
  ["strongs[2].textContent = '₹5,999'", "strongs[2].textContent = '₹2,300'"],
]

function patchPrices(text) {
  let next = text
    .replace(/"plan_2_price": "\d+"/g, '"plan_2_price": "900"')
    .replace(/"plan_3_price": "\d+"/g, '"plan_3_price": "1500"')
    .replace(/"plan_4_price": "\d+"/g, '"plan_4_price": "2300"')
    .replace(/"plan_2_monthly": "[^"]*"/g, '"plan_2_monthly": "≈ ₹300/month"')
    .replace(/"plan_3_monthly": "[^"]*"/g, '"plan_3_monthly": "≈ ₹250/month"')
    .replace(/"plan_4_monthly": "[^"]*"/g, '"plan_4_monthly": "≈ ₹192/month"')
    .replace(/"col_1_price": "₹[^"]*"/g, '"col_1_price": "₹900"')
    .replace(/"col_2_price": "₹[^"]*"/g, '"col_2_price": "₹1,500"')
    .replace(/"col_3_price": "₹[^"]*"/g, '"col_3_price": "₹2,300"')
    .replace(/"plan_3_text": "₹(?:666|600|500|433|333)"/g, '"plan_3_text": "₹300"')
    .replace(/"plan_6_text": "₹(?:583|467|450|350|283)"/g, '"plan_6_text": "₹250"')
    .replace(/"plan_12_text": "₹(?:500|375|333|292)"/g, '"plan_12_text": "₹192"')
  for (const [from, to] of PAIRS) next = next.split(from).join(to)
  return next
}

const repoFiles = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['sections/lurvox-plan-finder-v3.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder-v3.liquid'],
  ['sections/lurvox-tap-plan-force.liquid', 'scripts/shopify-assets/sections-lurvox-tap-plan-force.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-what-you-get.liquid', 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
  ['snippets/lurvox-plan-cards.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-cards.liquid'],
  ['snippets/lurvox-physique-preview.liquid', 'scripts/shopify-assets/snippets-lurvox-physique-preview.liquid'],
  ['snippets/lurvox-marketing-chat.liquid', 'scripts/shopify-assets/snippets-lurvox-marketing-chat.liquid'],
  ['snippets/lurvox-find-float.liquid', 'scripts/shopify-assets/snippets-lurvox-find-float.liquid'],
  ['snippets/lurvox-athletic-float.liquid', 'scripts/shopify-assets/snippets-lurvox-athletic-float.liquid'],
  ['snippets/lurvox-fitness-quiz.liquid', 'scripts/shopify-assets/snippets-lurvox-fitness-quiz.liquid'],
  ['snippets/lurvox-instant-intro.liquid', 'scripts/shopify-assets/snippets-lurvox-instant-intro.liquid'],
  ['snippets/lurvox-home-quiz.liquid', 'scripts/shopify-assets/snippets-lurvox-home-quiz.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'],
  ['sections/lurvox-hide-1month.liquid', 'scripts/shopify-assets/sections-lurvox-hide-1month.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['sections/lurvox-cart-builder.liquid', 'scripts/shopify-assets/sections-lurvox-cart-builder.liquid'],
  ['sections/lurvox-talk-to-coach.liquid', 'scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'],
  ['sections/lurvox-campaign.liquid', 'scripts/shopify-assets/sections-lurvox-campaign.liquid'],
  ['sections/lurvox-new-offer.liquid', 'scripts/shopify-assets/sections-lurvox-new-offer.liquid'],
  ['sections/lurvox-home-redesign.liquid', 'scripts/shopify-assets/sections-lurvox-home-redesign.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'],
  ['assets/lurvox-tap-plan.js', 'scripts/shopify-assets/assets/lurvox-tap-plan.js'],
]

const themeOnly = [
  'templates/index.json',
  'templates/page.json',
  'templates/page.compare-plans.json',
  'templates/page.compare-detail.json',
  'templates/page.compare-short.json',
  'templates/page.compare-stair.json',
  'templates/page.find-your-plan.json',
  'templates/page.talk-to-a-coach.json',
  'config/settings_data.json',
]

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

const files = []
for (const [key, rel] of repoFiles) {
  files.push({ filename: key, body: { type: 'TEXT', value: read(rel) } })
}
for (let i = 0; i < files.length; i += 6) {
  await upsert(files.slice(i, i + 6))
}

for (const key of themeOnly) {
  const live = await get(key)
  if (!live) {
    console.log('skip missing', key)
    continue
  }
  const patched = patchPrices(live)
  if (patched !== live) {
    await upsert([{ filename: key, body: { type: 'TEXT', value: patched } }])
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

const listed = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  headers: { 'X-Shopify-Access-Token': token },
})
const assetJson = await listed.json()
const uploaded = new Set([...repoFiles.map(([key]) => key), ...themeOnly, 'layout/theme.liquid'])
for (const asset of assetJson.assets || []) {
  if (!/\.(liquid|json|js)$/.test(asset.key)) continue
  if (uploaded.has(asset.key)) continue
  if (asset.key.startsWith('locales/')) continue
  if (!/lurvox|templates\/|blocks\/ai_gen|config\/settings_data/.test(asset.key)) continue
  const live = await get(asset.key)
  if (!live) continue
  const patched = patchPrices(live)
  if (patched === live) continue
  await upsert([{ filename: asset.key, body: { type: 'TEXT', value: patched } }])
  console.log('patched extra', asset.key)
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
await upsert([{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }])

const pages = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `{ pages(first: 80) { nodes { id handle body } } }`,
  }),
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

console.log('home', `https://www.lurvox.in/?v=${stamp}`)
