/**
 * Deploy stripped guarantee marketing + Terms-only links to live MAIN.
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

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const files = [
  'snippets/lurvox-sales-closer.liquid',
  'snippets/lurvox-conversion-boost.liquid',
  'sections/lurvox-how-it-works.liquid',
].map((filename) => ({
  filename,
  body: {
    type: 'TEXT',
    value: fs.readFileSync(
      path.join(ROOT, 'scripts/shopify-assets', filename.replace(/\//g, '-').replace('snippets-', 'snippets-').replace('sections-', 'sections-')),
      'utf8'
    ),
  },
}))

// Fix local asset path mapping
const localMap = {
  'snippets/lurvox-sales-closer.liquid': 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid',
  'snippets/lurvox-conversion-boost.liquid': 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid',
  'sections/lurvox-how-it-works.liquid': 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid',
}
for (const f of files) {
  f.body.value = fs.readFileSync(path.join(ROOT, localMap[f.filename]), 'utf8')
}
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
if (json.errors) throw new Error(JSON.stringify(json.errors))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors))
}
console.log('ok', `https://www.lurvox.in/?v=termsOnly${stamp}`)
