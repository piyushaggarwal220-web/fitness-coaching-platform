/**
 * Deploy plan prices to the live storefront: ₹999 / ₹1,699 / ₹2,999
 * (monthly ₹333 / ₹283 / ₹250).
 * Undoes any wrong intermediate deploys (₹1,499 / ₹2,699 / ₹3,999 etc.).
 * Uploads edited repo assets and fetch-patches theme-only JSON templates.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json()).themes
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
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

// Price string replacements applied to live JSON templates (theme-only files).
function patchPrices(text) {
  return text
    // Plan card settings (numeric strings) — force correct sale prices
    .replace(/"plan_2_price": "\d+"/g, '"plan_2_price": "999"')
    .replace(/"plan_3_price": "\d+"/g, '"plan_3_price": "1699"')
    .replace(/"plan_4_price": "\d+"/g, '"plan_4_price": "2999"')
    .replace(/"plan_2_monthly": "[^"]*"/g, '"plan_2_monthly": "≈ ₹333/month"')
    .replace(/"plan_3_monthly": "[^"]*"/g, '"plan_3_monthly": "≈ ₹283/month"')
    .replace(/"plan_4_monthly": "[^"]*"/g, '"plan_4_monthly": "≈ ₹250/month"')
    // Display prices (wrong / old → correct)
    .replace(/₹\s*1,499/g, '₹999')
    .replace(/₹\s*1,299/g, '₹999')
    .replace(/₹\s*1,099/g, '₹999')
    .replace(/₹\s*2,699/g, '₹1,699')
    .replace(/₹\s*2,599/g, '₹1,699')
    .replace(/₹\s*2,499/g, '₹1,699')
    .replace(/₹\s*2,099/g, '₹1,699')
    .replace(/₹\s*3,999/g, '₹2,999')
    .replace(/₹\s*3,699/g, '₹2,999')
    .replace(/₹\s*3,599/g, '₹2,999')
    .replace(/₹\s*3,499/g, '₹2,999')
    // Monthly rates in free text (wrong intermediate → correct band)
    .replace(/₹\s*500(\/mo|\/month)?/g, '₹333$1')
    .replace(/₹\s*566(\/mo|\/month)?/g, '₹333$1')
    .replace(/₹\s*433(\/mo|\/month)?/g, '₹333$1')
    .replace(/₹\s*366(\/mo|\/month)?/g, '₹333$1')
    .replace(/₹\s*450(\/mo|\/month)?/g, '₹283$1')
    .replace(/₹\s*350(\/mo|\/month)?/g, '₹283$1')
    .replace(/₹\s*292(\/mo|\/month)?/g, '₹250$1')
}

function patchBestFor(text) {
  return text
    .replace(/"plan_3_text": "90 day reset"/g, '"plan_3_text": "Lean for a big day. Short-term only."')
    .replace(/"plan_6_text": "Fat down, muscle up"/g, '"plan_6_text": "Already training. Recomp block."')
    .replace(/"plan_12_text": "Lifestyle change"/g, '"plan_12_text": "Beginners and intermediates who have plateaued, or want to start fresh."')
    .replace(/"plan_3_text": "Lose fat \/ tone up"/g, '"plan_3_text": "Lean for a big day. Short-term only."')
    .replace(/"plan_6_text": "Fat down \+ muscle up"/g, '"plan_6_text": "Already training. Recomp block."')
    .replace(/"plan_12_text": "Finished aesthetic look"/g, '"plan_12_text": "Beginners and intermediates who have plateaued, or want to start fresh."')
    .replace(/"plan_3_text": "Looking lean for a big day\. Not recommended for long-term results\."/g, '"plan_3_text": "Lean for a big day. Short-term only."')
    .replace(/"plan_6_text": "Advanced athletes already under 12% body fat, with good muscle\."/g, '"plan_6_text": "Already training. Recomp block."')
}

// 1) Edited repo assets uploaded verbatim.
const repoFiles = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'],
  ['sections/lurvox-hide-1month.liquid', 'scripts/shopify-assets/sections-lurvox-hide-1month.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['templates/page.compare-plans.json', 'scripts/shopify-assets/templates-page.compare-plans.json'],
]

// 2) Theme-only JSON templates: fetch live, patch prices, re-upload.
const themeOnly = [
  'templates/index.json',
  'templates/page.compare-detail.json',
  'templates/page.compare-short.json',
  'templates/page.compare-stair.json',
]

const files = []
for (const [key, rel] of repoFiles) {
  files.push({ filename: key, body: { type: 'TEXT', value: read(rel) } })
}
for (const key of themeOnly) {
  const live = await get(key)
  const patched = patchBestFor(patchPrices(live))
  if (patched !== live) {
    files.push({ filename: key, body: { type: 'TEXT', value: patched } })
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

// Cache-bust the layout so storefront HTML cache refreshes.
let layout = await get('layout/theme.liquid')
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
console.log('quiz', `https://www.lurvox.in/pages/find-your-plan?v=${stamp}`)
