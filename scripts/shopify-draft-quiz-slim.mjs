/**
 * Draft only: slim Find your plan quiz result CTAs.
 * NEVER publishes. NEVER writes to MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const DRAFT_ID = 162252554491
const MAIN_ID = 161948926203
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
  .access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json())
  .themes
const draft = themes.find((t) => t.id === DRAFT_ID)
if (!draft || draft.role === 'main' || draft.id === MAIN_ID) {
  console.error('REFUSING')
  process.exit(1)
}
console.log('Using unpublished draft', draft.id, draft.role)

let layout = (
  await (
    await fetch(
      `${REST}/themes/${draft.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
  ).json()
).asset.value
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  {
    filename: 'sections/lurvox-plan-finder-v3.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/tmp-plan-debloat-draft/sections__lurvox-plan-finder-v3.liquid'),
        'utf8'
      ),
    },
  },
  {
    filename: 'templates/page.find-your-plan.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(
        path.join(ROOT, 'scripts/tmp-plan-debloat-draft/templates__page.find-your-plan.json'),
        'utf8'
      ),
    },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const res = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${draft.id}`, files },
  }),
})
const json = await res.json()
if (json.errors || json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.errors || json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'Uploaded',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename).join(', ')
)
console.log('NOT published')
