/**
 * Draft only: compare-plans headers show package prices only.
 * NEVER publishes. NEVER writes to MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
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
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
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

function patchCompareJson(raw) {
  const json = JSON.parse(raw)
  for (const section of Object.values(json.sections || {})) {
    const settings = section.settings || {}
    if ('col_1_price' in settings) settings.col_1_price = '₹1,999'
    if ('col_2_price' in settings) settings.col_2_price = '₹3,499'
    if ('col_3_price' in settings) settings.col_3_price = '₹5,999'
    if (section.blocks?.r_month) delete section.blocks.r_month
    if (section.blocks?.g_value) delete section.blocks.g_value
    if (Array.isArray(section.block_order)) {
      section.block_order = section.block_order.filter(
        (id) => id !== 'r_month' && id !== 'g_value'
      )
    }
    for (const block of Object.values(section.blocks || {})) {
      const s = block.settings || {}
      if (s.plan_3_text === '₹666') s.plan_3_text = ''
      if (s.plan_6_text === '₹583') s.plan_6_text = ''
      if (s.plan_12_text === '₹500') s.plan_12_text = ''
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`
}

const themes = (await restGet(`${REST}/themes.json`)).themes ?? []
const matches = themes
  .filter((theme) => theme.name.trim() === TARGET_NAME && theme.role !== 'main')
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
const draft = matches[0]
if (!draft) {
  console.error(`TARGET_NOT_FOUND: ${TARGET_NAME}`)
  process.exit(1)
}
if (draft.role === 'main') {
  console.error('REFUSING: target theme is MAIN / live. Will not write.')
  process.exit(1)
}
console.log(`Using unpublished draft ${draft.id} (${draft.role})`)

const files = [
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
  {
    filename: 'templates/page.compare-short.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/templates-page.compare-short.json'),
        'utf8'
      ),
    },
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
]

const detailRes = await fetch(
  `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('templates/page.compare-detail.json')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
if (detailRes.ok) {
  const value = (await detailRes.json()).asset?.value
  if (value) {
    files.push({
      filename: 'templates/page.compare-detail.json',
      body: { type: 'TEXT', value: patchCompareJson(value) },
    })
  }
}

let layoutRes
try {
  layoutRes = await restGet(
    `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
} catch {
  layoutRes = null
}
let layout = layoutRes?.asset?.value ?? null
if (layout) {
  const stamp = Date.now()
  if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
    layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  } else {
    layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  }
  files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })
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
    files,
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log('Uploaded', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', '))
console.log('NOT published. Preview: https://www.lurvox.in/pages/compare-plans?preview_theme_id=' + draft.id)
