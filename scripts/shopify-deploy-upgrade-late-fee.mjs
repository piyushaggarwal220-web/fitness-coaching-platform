/**
 * Live MAIN: 48h free upgrade + ₹250 late upgrade fee on cards / closer / matrix.
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

const UPGRADE =
  'Free upgrade within 48 hours of taking your plan. After 48 hours, upgrades cost ₹250 extra.'

const index = JSON.parse(await get('templates/index.json'))
const s = index.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh.settings
s.plan_2_footer = `Duration: 90 days. ${UPGRADE}`
s.plan_3_footer = `Duration: 6 months. ${UPGRADE}`
s.plan_4_footer = `Duration: 12 months. ${UPGRADE}`

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
    filename: 'snippets/lurvox-plan-compare-inline.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
        'utf8'
      ),
    },
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
console.log('ok', `https://www.lurvox.in/?v=latefee${stamp}#plans`)
