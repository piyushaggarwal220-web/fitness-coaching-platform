/**
 * Live MAIN: card footers = goal outcomes only (no upgrade fee copy on cards).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

const index = JSON.parse(await get('templates/index.json'))
const s = index.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh.settings

s.plan_2_label = 'Fat loss'
s.plan_2_duration = '90 DAYS'
s.plan_2_description = 'Lose fat, tone up, build the habit.'
s.plan_2_footer = 'Best for: first visible fat loss'

s.plan_3_label = 'Fat loss + muscle'
s.plan_3_duration = '6 MONTHS'
s.plan_3_description = 'Fat down, muscle up, clothes fit differently.'
s.plan_3_footer = 'Best for: recomp past 90 days'

s.plan_4_label = 'Build Your Dream Body'
s.plan_4_duration = '12 MONTHS'
s.plan_4_description = 'Full physique and lifestyle change.'
s.plan_4_footer = 'Best for: all-in aesthetic goal'

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

// Keep upgrade off the compare matrix under cards — goals/features only
let matrix = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
matrix = matrix.replace(
  /\s*<tr>\s*<th scope="row">Free upgrade within 48 hours[^<]*<\/th>[\s\S]*?<\/tr>\s*/,
  '\n'
)

const files = [
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
  {
    filename: 'snippets/lurvox-plan-compare-inline.liquid',
    body: { type: 'TEXT', value: matrix },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

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
if (json.errors) throw new Error(JSON.stringify(json.errors))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors))
}

fs.writeFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  matrix
)
console.log('ok', `https://www.lurvox.in/?v=goalcards${stamp}#plans`)
