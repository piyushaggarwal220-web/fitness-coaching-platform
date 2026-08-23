/**
 * Deploy plan finder with post-quiz "why this plan / what others miss" comparison block.
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

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const files = [
  {
    filename: 'sections/lurvox-plan-finder.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-plan-finder.liquid') },
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
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
      files,
    },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)
console.log('quiz', `https://www.lurvox.in/pages/find-your-plan?v=pf${stamp}`)
