/**
 * Live MAIN: push Aesthetic (12 months) as the recommended plan.
 * - Homepage cards: badges, footers, ₹/month
 * - Compare matrix: 12 months featured
 * - Plan finder: stronger 12-month bias + upgrade nudge
 *
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
const s = index.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh.settings

s.headline = 'Pick your goal. Duration comes second.'
s.subheadline =
  'Fat loss · 90 days. Fat loss + muscle · 6 months. Aesthetic body · 12 months (recommended). WELCOME60 = 60% off'

s.plan_2_label = 'Fat loss'
s.plan_2_badge = 'START HERE'
s.plan_2_duration = '90 DAYS'
s.plan_2_description = 'Lose fat, tone up, build the habit. Reset — not the finished look.'
s.plan_2_footer = 'Best for: first visible fat loss'
s.plan_2_monthly = '≈ ₹333/month'
s.plan_2_price = '999'

s.plan_3_label = 'Fat loss + muscle'
s.plan_3_badge = 'POPULAR'
s.plan_3_duration = '6 MONTHS'
s.plan_3_description = 'Fat down, muscle up. Strong progress — not full aesthetic yet.'
s.plan_3_footer = 'Best for: recomp past 90 days'
s.plan_3_monthly = '≈ ₹283/month'
s.plan_3_price = '1699'

s.plan_4_label = 'Aesthetic body'
s.plan_4_badge = 'RECOMMENDED'
s.plan_4_duration = '12 MONTHS'
s.plan_4_description = 'Finished physique + lifestyle. Lowest ₹/month + weekly coach call.'
s.plan_4_footer = 'Best for: lasting aesthetic change'
s.plan_4_monthly = '≈ ₹250/month'
s.plan_4_price = '2999'

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
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'sections/lurvox-plan-finder.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'),
        'utf8'
      ),
    },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
    files,
  }
)

const result = data.themeFilesUpsert
console.log(
  JSON.stringify(
    {
      upserted: result.upsertedThemeFiles?.map((f) => f.filename),
      userErrors: result.userErrors,
      stamp,
    },
    null,
    2
  )
)
if (result.userErrors?.length) process.exit(1)
