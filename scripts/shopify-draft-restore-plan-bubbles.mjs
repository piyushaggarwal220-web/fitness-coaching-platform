/**
 * Draft only: restore homepage plan cards to the earlier look.
 * NEVER publishes. NEVER writes MAIN.
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
const PLAN_BLOCK = 'ai_gen_block_361650c_qqYKXh'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

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
console.log(`Using unpublished draft ${draft.id}`)

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
  top_label: 'CHOOSE YOUR GOAL',
  headline: 'Pick your goal. We handle the rest.',
  subheadline: 'Fat Loss · 90 days. Fat loss + muscle gain · 6 months. Athletic body · 12 months.',
  plan_2_badge: 'Debloat',
  plan_2_duration: '90 DAYS',
  plan_2_monthly: '≈ ₹666/month',
  plan_2_savings: '',
  plan_2_description: 'Fat loss',
  plan_2_footer: 'Best for: dropping fat fast and getting visibly leaner — real results in 90 days',
  plan_3_badge: '⭐ Most Popular',
  plan_3_duration: '6 MONTHS',
  plan_3_monthly: '≈ ₹583/month',
  plan_3_savings: 'Save ₹1,495 vs monthly rate',
  plan_3_description: 'Fat loss + muscle gain',
  plan_3_footer: 'Best for: losing fat while building muscle',
  plan_4_badge: 'Complete transformation',
  plan_4_duration: '12 MONTHS',
  plan_4_monthly: '≈ ₹500/month',
  plan_4_savings: 'Save ₹3,989 vs monthly rate',
  plan_4_description: 'Athletic body',
  plan_4_footer: 'Best for: building an athletic body — fat loss, muscle gain, and stamina',
})

let layout = (
  await restGet(
    `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
).asset?.value
if (!layout) throw new Error('layout missing')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${draft.id}`,
    files: [
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
      {
        filename: 'templates/index.json',
        body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
      },
      { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log('Uploaded', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
console.log('NOT published. Preview: https://www.lurvox.in/?preview_theme_id=' + draft.id + '#plans')
