/**
 * Deploy Orange marketing polish: guarantee stamp + Instant-style animated transforms.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

const tokenFile = fs.existsSync(tokenPath)
  ? JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
  : null
if (!tokenFile?.refresh_token && !process.env.SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

if (tokenFile?.refresh_token) {
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
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const files = [
  ['snippets/lurvox-guarantee-stamp.liquid', 'scripts/shopify-assets/snippets-lurvox-guarantee-stamp.liquid'],
  ['snippets/lurvox-animated-transforms.liquid', 'scripts/shopify-assets/snippets-lurvox-animated-transforms.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['sections/lurvox-home-redesign.liquid', 'scripts/shopify-assets/sections-lurvox-home-redesign.liquid'],
].map(([filename, rel]) => ({
  filename,
  body: { type: 'TEXT', value: read(rel) },
}))

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
console.log('done — Orange stamp + animated transforms live')
