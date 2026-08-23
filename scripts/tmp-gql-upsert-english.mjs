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

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main.name, main.id)

const layoutRes = await fetch(
  `${REST}/themes/${main.id.split('/').pop()}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await layoutRes.json()).asset.value
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const files = [
  {
    filename: 'sections/lurvox-plan-finder.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-plan-finder.liquid') },
  },
  {
    filename: 'snippets/lurvox-conversion-boost.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid') },
  },
  {
    filename: 'sections/lurvox-how-it-works.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-how-it-works.liquid') },
  },
  {
    filename: 'sections/lurvox-ad-landing.liquid',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/sections-lurvox-ad-landing.liquid') },
  },
  {
    filename: 'templates/page.find-your-plan.json',
    body: { type: 'TEXT', value: read('scripts/shopify-assets/templates-page.find-your-plan.json') },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: main.id, files }
)
if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)
console.log('stamp', stamp)

for (let i = 0; i < 8; i += 1) {
  await new Promise((r) => setTimeout(r, 7000))
  const html = await (
    await fetch(`https://www.lurvox.in/pages/find-your-plan?cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 verify' },
    })
  ).text()
  const row = {
    i,
    newBust: html.includes(`lurvox-cache-bust ${stamp}`),
    ghar: /ghar[-\s]?ka[-\s]?khana/i.test(html),
    homeCooked: /Home cooked food\. Keep it simple/.test(html),
  }
  console.log(JSON.stringify(row))
  if (row.homeCooked && !row.ghar) break
}
