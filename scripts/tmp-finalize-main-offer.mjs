/**
 * Ensure Offer live theme is MAIN with all offer assets + CDN overlay script in layout.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const MAIN = '161391804667'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

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

async function get(themeId, key) {
  const j = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  return j.asset
}

const stamp = Date.now()
const overlayAsset = await get(MAIN, 'assets/lurvox-offer-overlay.js')
const overlayCdn = (overlayAsset.public_url || '').replace(/\?v=.*/, '') + '?v=' + stamp
// Prefer shopify CDN host
const overlaySrc = overlayCdn.includes('cdn.shopify.com')
  ? overlayCdn
  : `https://cdn.shopify.com/s/files/1/0815/3133/9003/t/26/assets/lurvox-offer-overlay.js?v=${stamp}`

let layout = (await get(MAIN, 'layout/theme.liquid')).value
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
if (!layout.includes('lurvox-cache-bust')) {
  layout = layout.replace('</head>', `  <!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}
if (!layout.includes('lurvox-offer-overlay.js')) {
  layout = layout.replace('</body>', `  <script src="${overlaySrc}" defer></script>\n</body>`)
} else {
  layout = layout.replace(
    /src="[^"]*lurvox-offer-overlay\.js[^"]*"/,
    `src="${overlaySrc}"`
  )
}

const files = [
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'sections__lurvox-offer-home.liquid'), 'utf8'),
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
  {
    filename: 'snippets/header-drawer.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'snippets__header-drawer.liquid'), 'utf8'),
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
    filename: 'templates/index.json',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(DIR, 'templates__index.json'), 'utf8'),
    },
  },
]

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: `gid://shopify/OnlineStoreTheme/${MAIN}`, files }
)
console.log(JSON.stringify(upsert, null, 2))

const pub = await gql(
  `mutation($id:ID!){ themePublish(id:$id){ theme{name role} userErrors{message}}}`,
  { id: `gid://shopify/OnlineStoreTheme/${MAIN}` }
)
console.log('published', JSON.stringify(pub))

// Verify theme editor preview path
const preview = await fetch(
  `https://www.lurvox.in/?preview_theme_id=${MAIN}&cb=${Date.now()}`,
  { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
)
const html = await preview.text()
const st = preview.headers.get('server-timing') || ''
console.log({
  stTheme: st.match(/theme;desc="(\d+)"/)?.[1],
  shopifyTheme: html.match(/"id":(\d+),"schema_name"/)?.[1],
  offer: /SAVE5|lurvox-offer/.test(html),
  price: html.includes('Price increases in'),
  drawer: html.includes('lurvox-drawer-login'),
  overlay: html.includes('lurvox-offer-overlay'),
  oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
})
