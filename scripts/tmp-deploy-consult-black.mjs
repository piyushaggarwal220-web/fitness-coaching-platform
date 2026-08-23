import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME_ID = 161294057723
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161294057723'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const section = fs.readFileSync(
  path.join('scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)

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
      files: [
        {
          filename: 'sections/lurvox-talk-to-coach.liquid',
          body: { type: 'TEXT', value: section },
        },
      ],
    },
  }),
}).then((r) => r.json())

if (upsert.errors) throw new Error(JSON.stringify(upsert.errors))
console.log(JSON.stringify(upsert.data.themeFilesUpsert, null, 2))

const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('sections/lurvox-talk-to-coach.liquid')}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

console.log({
  hasBlackBg: /background:\s*#000/.test(verify),
  hasLightInk: verify.includes('--lx-ink: #f5f5f5'),
})
console.log(
  'Preview: https://admin.shopify.com/store/9uwyq1-0j/themes/161294057723/editor?previewPath=%2Fpages%2Ftalk-to-a-coach'
)
