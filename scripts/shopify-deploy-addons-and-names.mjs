/**
 * Push cart builder (3 add-ons) + plan name copy to live theme.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const tokenPath = path.join(process.env.TEMP || '', 'shopify-auth-token.json')
const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token

function file(rel, dest) {
  return {
    filename: dest,
    body: { type: 'TEXT', value: fs.readFileSync(path.join(ROOT, rel), 'utf8') },
  }
}

const files = [
  file('scripts/shopify-assets/sections-lurvox-cart-builder.liquid', 'sections/lurvox-cart-builder.liquid'),
  file(
    'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid',
    'snippets/lurvox-plan-compare-inline.liquid'
  ),
  file('scripts/shopify-assets/sections-lurvox-ad-landing.liquid', 'sections/lurvox-ad-landing.liquid'),
  file('scripts/shopify-assets/sections-lurvox-plan-finder.liquid', 'sections/lurvox-plan-finder.liquid'),
]

const res = await fetch(GQL, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
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
if (json.errors || json.data?.themeFilesUpsert?.userErrors?.length) {
  console.error(JSON.stringify(json, null, 2))
  process.exit(1)
}
console.log(
  'upserted',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', ')
)
