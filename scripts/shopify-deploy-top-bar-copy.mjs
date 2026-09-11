/**
 * Replace the SUMMER60 discount countdown with a brand line.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
  .access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themeRes = await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
const main = (await themeRes.json()).themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

const headline = 'Best human coaching platform in India'
let index = await get('templates/index.json')
const data = JSON.parse(index)
const offer = data.sections?.lurvox_offer_home
if (offer?.settings) {
  offer.settings.headline = headline
  offer.settings.enabled = true
}
index = JSON.stringify(data)

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join('scripts', 'shopify-assets', 'sections-lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  { filename: 'templates/index.json', body: { type: 'TEXT', value: index } },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
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
console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('home', `https://www.lurvox.in/?v=${stamp}`)
