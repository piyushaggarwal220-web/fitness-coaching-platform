import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))

if (tokenFile.refresh_token) {
  const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (refresh.ok) {
    Object.assign(tokenFile, JSON.parse(await refresh.text()))
    fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  }
}

const token = process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = (await (await fetch(`${REST}/themes.json`, { headers: H })).json()).themes ?? []
const main = themes.find((t) => t.role === 'main')
const value = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-guarantee-stamp.liquid'),
  'utf8'
)

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
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: 'snippets/lurvox-guarantee-stamp.liquid', body: { type: 'TEXT', value } }],
    },
  }),
})
const json = await res.json()
if (json.errors || json.data?.themeFilesUpsert?.userErrors?.length) {
  throw new Error(JSON.stringify(json, null, 2))
}
console.log('larger stamp deployed', main.id, main.name)
