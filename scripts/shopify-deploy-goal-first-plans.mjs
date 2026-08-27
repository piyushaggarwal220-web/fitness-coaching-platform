/**
 * Live MAIN: reframe homepage plans as goal-first, duration secondary.
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

// --- local asset copy updates ---
let matrix = read('scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid')
matrix = matrix
  .replace(
    '3 months starts you. 6 months adds more. 12 months is everything.',
    'Fat loss starts you. Recomp adds muscle. Aesthetic is the full stack.'
  )
  .replace(
    `<span>3 months</span>
            <strong>₹999</strong>`,
    `<span>Fat loss</span>
            <small>90 days</small>
            <strong>₹999</strong>`
  )
  .replace(
    `<span>6 months</span>
            <strong>₹1,699</strong>`,
    `<span>Fat loss + muscle</span>
            <small>6 months</small>
            <strong>₹1,699</strong>`
  )
  .replace(
    `<span>12 months</span>
            <strong>₹2,999</strong>`,
    `<span>Build Your Dream Body</span>
            <small>12 months</small>
            <strong>₹2,999</strong>`
  )
  .replace('Opens with 3 months', 'Opens with fat loss')
  .replace('More with 6 months', 'More with fat loss + muscle')
  .replace('Everything with 12 months', 'Everything with aesthetic')
  .replace('<td>90 day reset</td>', '<td>Lose fat / tone up</td>')
  .replace('<td class="is-featured">Fat down, muscle up</td>', '<td class="is-featured">Fat down + muscle up</td>')
  .replace('<td>Lifestyle change</td>', '<td>Aesthetic physique</td>')

// ensure small duration style exists once
if (!matrix.includes('.lx-matrix__table thead small')) {
  matrix = matrix.replace(
    '.lx-matrix__table thead strong {',
    `.lx-matrix__table thead small {
  display: block;
  margin-top: 2px;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(245,245,245,0.55);
  text-transform: none;
  letter-spacing: 0;
}
.lx-matrix__table thead strong {`
  )
}
fs.writeFileSync(path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'), matrix)

let closer = read('scripts/shopify-assets/snippets-lurvox-sales-closer.liquid')
closer = closer.replace(
  /These are goal plans with a timeline attached\.[^<]*/,
  'Goal first. Time is the runway. <strong>Fat loss</strong> is a 90 day reset. <strong>Fat loss + muscle</strong> is 6 months. <strong>Build Your Dream Body</strong> is 12 months, with the weekly coach phone call.'
)
fs.writeFileSync(path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'), closer)

let finder = read('scripts/shopify-assets/sections-lurvox-plan-finder.liquid')
finder = finder
  .replace("label: 'Quick Reset'", "label: 'Fat loss'")
  .replace("per: '90 day goal · 3 months'", "per: '90 days'")
  .replace("label: 'Recomposition'", "label: 'Fat loss + muscle'")
  .replace("per: 'Fat down, muscle up · 6 months'", "per: '6 months'")
  .replace("label: 'Complete Transformation'", "label: 'Build Your Dream Body'")
  .replace("per: 'Lifestyle change · 12 months'", "per: '12 months'")
  .replace(
    "'Your goal is to ' +\n          goalLabel +\n          '. Quick Reset is the 90 day goal plan: enough time to see a first change without locking a full year.';",
    "'Your goal is to ' +\n          goalLabel +\n          '. Fat loss is the 90 day plan: enough time to see a first change without locking a full year.';"
  )
  .replace(
    "'Your goal is to ' +\n          goalLabel +\n          '. Complete Transformation is the all-in plan' +",
    "'Your goal is to ' +\n          goalLabel +\n          '. Build Your Dream Body is the all-in plan' +"
  )
  .replace(
    "'Your goal is to ' +\n          goalLabel +\n          '. Recomposition is the 6 month goal plan: fat down, muscle up, with weekly reviews so you do not stall after 90 days.';",
    "'Your goal is to ' +\n          goalLabel +\n          '. Fat loss + muscle is the 6 month plan: fat down, muscle up, with weekly reviews so you do not stall after 90 days.';"
  )
fs.writeFileSync(path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'), finder)

const index = JSON.parse(await get('templates/index.json'))
const plans = index.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh
if (!plans?.settings) throw new Error('Plan cards block not found in index.json')

const s = plans.settings
s.top_label = 'CHOOSE YOUR GOAL'
s.headline = 'Pick your goal. We handle the rest.'
s.subheadline =
  'Fat loss · 90 days. Fat loss + muscle · 6 months. Build Your Dream Body · 12 months. WELCOME60 = 60% off'

s.plan_2_label = 'Fat loss'
s.plan_2_badge = 'START HERE'
s.plan_2_duration = '90 DAYS'
s.plan_2_description = 'Lose fat and tone up with a coach-built plan.'
s.plan_2_footer = 'Duration: 3 months. Best first goal if you want a clear 90 day reset.'

s.plan_3_label = 'Fat loss + muscle'
s.plan_3_badge = 'POPULAR'
s.plan_3_duration = '6 MONTHS'
s.plan_3_description = 'Drop fat while building shape and strength.'
s.plan_3_footer = 'Duration: 6 months. Weekly plan updates so you do not stall after 90 days.'

s.plan_4_label = 'Build Your Dream Body'
s.plan_4_badge = 'FULL STACK'
s.plan_4_duration = '12 MONTHS'
s.plan_4_description = 'The complete physique and lifestyle change.'
s.plan_4_footer = 'Duration: 12 months. Weekly coach phone call included.'

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
    filename: 'snippets/lurvox-sales-closer.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'),
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

// Also update live compare page column labels if present
try {
  const compare = JSON.parse(await get('templates/page.compare-short.json'))
  const sec = Object.values(compare.sections || {}).find((x) => x.type === 'lurvox-plan-compare')
  if (sec?.settings) {
    sec.settings.col_1_label = 'Fat loss'
    sec.settings.col_2_label = 'Fat loss + muscle'
    sec.settings.col_3_label = 'Build Your Dream Body'
    sec.settings.headline = sec.settings.headline?.includes('month')
      ? 'Goal first. Duration second.'
      : sec.settings.headline
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
  {
    themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
    files,
  }
)
if (data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)
console.log('live', `https://www.lurvox.in/?v=goals${stamp}#plans`)
