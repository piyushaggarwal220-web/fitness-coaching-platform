import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const body = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)

const res = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
  method: 'POST',
  headers: {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
      files: [
        {
          filename: 'snippets/lurvox-plan-compare-inline.liquid',
          body: { type: 'TEXT', value: body },
        },
      ],
    },
  }),
})
const json = await res.json()
if (json.errors?.length || json.data?.themeFilesUpsert?.userErrors?.length) {
  throw new Error(JSON.stringify(json, null, 2))
}
console.log('matrix ok')
