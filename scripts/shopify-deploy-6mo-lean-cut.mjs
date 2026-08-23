/**
 * Live MAIN: 6 months = get leaner / keep muscle. 12 months = fat loss + muscle.
 * Theme: 161454620923
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const index = JSON.parse(await get('templates/index.json'))
const plans = index.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh
if (!plans?.settings) throw new Error('Plan cards block not found in index.json')

const s = plans.settings
s.top_label = 'GOAL FIRST'
s.headline = 'Pick your goal. Duration comes second.'
s.subheadline =
  'Fat loss · 90 days. Get leaner, keep muscle · 6 months. Fat loss + muscle · 12 months (recommended). WELCOME60 = 60% off'

s.plan_2_label = 'Fat loss'
s.plan_2_badge = 'EVENT'
s.plan_2_duration = '90 DAYS'
s.plan_2_description = 'Lean for a wedding, trip, or shoot. A sprint — not fat plus muscle.'
s.plan_2_footer = 'Best for: a date on the calendar'

s.plan_3_label = 'Get leaner, keep muscle'
s.plan_3_badge = ''
s.plan_3_duration = '6 MONTHS'
s.plan_3_description = 'Already training. Drop fat without going skinny. Not a from-zero rebuild.'
s.plan_3_footer = 'Best for: a cut if you already lift'

s.plan_4_label = 'Fat loss + muscle'
s.plan_4_badge = 'RECOMMENDED'
s.plan_4_duration = '12 MONTHS'
s.plan_4_description = 'Fat down and muscle up. The plan for most people.'
s.plan_4_footer = 'Best for: most people starting a real change'

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const files = [
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
  {
    filename: 'snippets/lurvox-plan-compare-inline.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid') },
  },
  {
    filename: 'snippets/lurvox-sales-closer.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-sales-closer.liquid') },
  },
  {
    filename: 'sections/lurvox-plan-finder.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-plan-finder.liquid') },
  },
  {
    filename: 'sections/lurvox-plan-compare.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-plan-compare.liquid') },
  },
  {
    filename: 'sections/lurvox-talk-to-coach.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid') },
  },
  {
    filename: 'sections/lurvox-cart-builder.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-cart-builder.liquid') },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

try {
  const compare = JSON.parse(await get('templates/page.compare-short.json'))
  const sec = Object.values(compare.sections || {}).find((x) => x.type === 'lurvox-plan-compare')
  if (sec?.settings) {
    sec.settings.col_1_label = 'Fat loss'
    sec.settings.col_2_label = 'Get leaner, keep muscle'
    sec.settings.col_3_label = 'Fat loss + muscle'
    sec.settings.headline = '90 days is an event. 6 months keeps muscle. 12 months builds both.'
    files.push({
      filename: 'templates/page.compare-short.json',
      body: { type: 'TEXT', value: `${JSON.stringify(compare, null, 2)}\n` },
    })
  }
} catch (e) {
  console.log('compare-short skip', e.message)
}

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: `gid://shopify/OnlineStoreTheme/${THEME}`, files }
)

if (data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'ok',
  data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename),
  `https://www.lurvox.in/?v=leancut${stamp}#plans`
)
