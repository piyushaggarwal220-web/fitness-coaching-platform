/**
 * Live MAIN: restore smooth native scroll-snap on the top hero carousel.
 * Theme: 161454620923
 */
import fs from 'node:fs'
import path from 'node:path'

const THEME = 161454620923
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
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
  const res = await fetch(`${REST}/graphql.json`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const carousel = fs
  .readFileSync(path.join(process.cwd(), 'scripts/tmp-live-carousel-block.liquid'), 'utf8')
  .replace(/^\uFEFF/, '')

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  { filename: 'blocks/ai_gen_block_52353f6.liquid', body: { type: 'TEXT', value: carousel } },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const result = (
  await gql(
    `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: `gid://shopify/OnlineStoreTheme/${THEME}`, files }
  )
).themeFilesUpsert

console.log(
  JSON.stringify(
    { upserted: result.upsertedThemeFiles?.map((f) => f.filename), userErrors: result.userErrors, stamp },
    null,
    2
  )
)
if (result.userErrors?.length) process.exit(1)
