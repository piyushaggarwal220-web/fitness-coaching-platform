import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const resThemes = await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
const themesJson = await resThemes.json()
if (!resThemes.ok) {
  console.error('themes', resThemes.status, JSON.stringify(themesJson).slice(0, 500))
  throw new Error(`themes.json ${resThemes.status}`)
}
const themes = themesJson.themes
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

const files = [
  {
    filename: 'sections/lurvox-cart-builder.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-cart-builder.liquid'), 'utf8'),
    },
  },
  {
    filename: 'templates/page.cart-builder.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/templates-page.cart-builder.json'), 'utf8'),
    },
  },
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
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${main.id}`, files },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', ')
)
