/**
 * Force Tap plan theme (sticky page_cache identity) to recompile via
 * GraphQL upsert of a tiny settings stamp + ensure offer assets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const TAP = '161389281531'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME_GID = `gid://shopify/OnlineStoreTheme/${TAP}`

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function get(key) {
  const j = await fetch(
    `${REST}/themes/${TAP}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  return j.asset?.value
}

const stamp = Date.now()
let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
if (!layout.includes('lurvox-cache-bust')) {
  layout = layout.replace('</head>', `  <!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}
// Also inject overlay script tag pointing at shopify CDN absolute URL (bypasses www CF stale)
const overlayCdn =
  'https://cdn.shopify.com/s/files/1/0815/3133/9003/t/24/assets/lurvox-offer-overlay.js?v=' + stamp
if (!layout.includes('lurvox-offer-overlay.js')) {
  layout = layout.replace(
    '</body>',
    `  <script src="${overlayCdn}" defer></script>\n</body>`
  )
} else {
  layout = layout.replace(
    /https:\/\/cdn\.shopify\.com\/s\/files\/[^"']+lurvox-offer-overlay\.js\?v=\d+/,
    overlayCdn
  )
}

const files = [
  {
    filename: 'layout/theme.liquid',
    body: { type: 'TEXT', value: layout },
  },
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  {
    filename: 'templates/index.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'templates__index.json'), 'utf8'),
    },
  },
  {
    filename: 'blocks/ai_gen_block_361650c.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'blocks__ai_gen_block_361650c.liquid'), 'utf8'),
    },
  },
  {
    filename: 'snippets/header-drawer.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'snippets__header-drawer.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/lurvox-client-login.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-client-login.liquid'), 'utf8'),
    },
  },
  {
    filename: 'sections/header-group.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__header-group.json'), 'utf8'),
    },
  },
]

// Upload overlay to tap theme too
const mainOverlay = await fetch(
  `${REST}/themes/161391804667/assets.json?asset[key]=assets/lurvox-offer-overlay.js`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())
await fetch(`${REST}/themes/${TAP}/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    asset: { key: 'assets/lurvox-offer-overlay.js', value: mainOverlay.asset.value },
  }),
})
console.log('overlay uploaded to tap')

console.log('upserting tap theme...')
const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: THEME_GID, files }
)
console.log(JSON.stringify(upsert, null, 2))

// Publish TAP briefly so page_cache identity matches MAIN role, then keep as unpublished?
// Actually page_cache already shows Tap as Shopify.theme. Publish Tap as MAIN.
console.log('publishing TAP as MAIN to align cache identity...')
await gql(
  `mutation($id:ID!){ themePublish(id:$id){ theme{name role id} userErrors{message}}}`,
  { id: THEME_GID }
)

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const r = await fetch(`https://www.lurvox.in/index?cb=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
  })
  const html = await r.text()
  const p = {
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0],
    overlayScript: html.includes('lurvox-offer-overlay.js'),
    save5: html.includes('SAVE5'),
    offerHome: html.includes('lurvox-offer'),
    price: html.includes('Price increases in'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
    shopifyTheme: html.match(/"id":(\d+)/)?.[1],
    cdnT: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
  }
  console.log(i, p)
  if ((p.overlayScript || p.offerHome || p.save5) && (!p.oldLogin || p.save5)) {
    console.log('LIVE')
    process.exit(0)
  }
}
process.exit(1)
