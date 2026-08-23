import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME_ID = 161294057723
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161294057723'
const KEY = 'sections/lurvox-talk-to-coach.liquid'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const section = fs.readFileSync(
  path.join('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)

console.log('local has light ink', section.includes('--lx-ink: #f5f5f5'))
console.log('local has black body rule', section.includes('background: #000 !important'))

const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: section } }),
}).then(async (r) => ({ status: r.status, json: await r.json() }))
console.log('REST', put.status, put.json.errors || put.json.asset?.updated_at)

const upsert = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: THEME_GID,
      files: [{ filename: KEY, body: { type: 'TEXT', value: section } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL', JSON.stringify(upsert.data?.themeFilesUpsert || upsert.errors))

await new Promise((r) => setTimeout(r, 2000))
const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

console.log({
  remoteLightInk: verify.includes('--lx-ink: #f5f5f5'),
  remoteBlackImportant: verify.includes('background: #000 !important'),
  remoteSoft: verify.includes('--lx-soft: #1a1a1a'),
})
