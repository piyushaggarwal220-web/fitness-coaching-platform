/**
 * Draft only: first-timer plan cards. NEVER publishes. NEVER writes MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const DRAFT_ID = 162252554491
const MAIN_ID = 161948926203
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const PLAN_BLOCK = 'ai_gen_block_361650c_qqYKXh'

if (!fs.existsSync(tokenPath)) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function restGet(url) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } })
  if (!res.ok) throw new Error(`GET ${url} ${res.status} ${await res.text()}`)
  return res.json()
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

const themes = (await restGet(`${REST}/themes.json`)).themes ?? []
const draft = themes.find((theme) => theme.id === DRAFT_ID)
if (!draft || draft.id === MAIN_ID || draft.role === 'main') {
  console.error('REFUSING: missing draft or target is MAIN')
  process.exit(1)
}
if (draft.name.trim() !== TARGET_NAME) {
  console.error(`REFUSING: unexpected name "${draft.name}"`)
  process.exit(1)
}
console.log(`Using unpublished draft ${draft.id} (${draft.role}) ${draft.name}`)

const index = JSON.parse(
  (
    await restGet(
      `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`
    )
  ).asset.value
)
const plan = index.sections?.home_blocks_v2?.blocks?.[PLAN_BLOCK]
if (!plan?.settings) throw new Error(`plan block ${PLAN_BLOCK} missing`)
Object.assign(plan.settings, {
  top_label: 'Plans',
  headline: '3, 6, or 12 months',
  subheadline: 'Workout, diet, and a human coach on every plan. Weekly phone call on 12 months only.',
  plan_2_badge: '',
  plan_2_monthly: '',
  plan_2_savings: '',
  plan_2_description: '',
  plan_2_footer: '',
  plan_3_badge: '',
  plan_3_monthly: '',
  plan_3_savings: '',
  plan_3_description: '',
  plan_3_footer: '',
  plan_4_badge: '',
  plan_4_monthly: '',
  plan_4_savings: '',
  plan_4_description: '',
  plan_4_footer: 'Weekly coach phone call included',
})

const slim = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-short.json'),
  'utf8'
)

const files = [
  {
    filename: 'sections/lurvox-plan-compare.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'blocks/ai_gen_block_361650c.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'),
        'utf8'
      ),
    },
  },
  { filename: 'templates/page.compare-short.json', body: { type: 'TEXT', value: slim } },
  {
    filename: 'templates/page.compare-plans.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-plans.json'),
        'utf8'
      ),
    },
  },
  { filename: 'templates/page.compare-stair.json', body: { type: 'TEXT', value: slim } },
  { filename: 'templates/page.compare-detail.json', body: { type: 'TEXT', value: slim } },
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
]

let layout = (
  await restGet(
    `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
).asset?.value
if (!layout) throw new Error('layout/theme.liquid missing on draft')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}
files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${draft.id}`,
    files,
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log(
  'Uploaded',
  upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', ')
)
console.log('NOT published.')
console.log('Preview home: https://www.lurvox.in/?preview_theme_id=' + draft.id + '#plans')
console.log('Preview compare: https://www.lurvox.in/pages/compare-fit?preview_theme_id=' + draft.id)
