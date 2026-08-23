import fs from 'fs'
import path from 'path'
import os from 'os'

const auth = JSON.parse(
  fs.readFileSync(path.join(os.tmpdir(), 'shopify-auth-token.json'), 'utf8')
)
const token = auth.access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2024-10'
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}
const NEW = '161391804667'
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'tmp-live-main')
// fix windows path via fileURLToPath
import { fileURLToPath } from 'url'
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')

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

async function getAsset(key) {
  const r = await fetch(
    `${REST}/themes/${NEW}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const j = await r.json()
  return j.asset?.value || null
}

async function putAsset(key, value) {
  const r = await fetch(`${REST}/themes/${NEW}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(`${key}: ${JSON.stringify(j.errors)}`)
  console.log('updated', key)
}

// Wait until duplicate has core sections
for (let i = 0; i < 40; i++) {
  const login = await getAsset('sections/lurvox-client-login.liquid')
  const header = await getAsset('sections/header.liquid')
  const ready = !!(login && header)
  console.log(i, 'ready', ready, 'loginOffer', login?.includes('lurvox-offer-strip'), 'loginLen', login?.length)
  if (ready) break
  await new Promise((r) => setTimeout(r, 3000))
}

// Ensure offer assets (safe files only first)
const files = {
  'sections/lurvox-client-login.liquid': 'sections__lurvox-client-login.liquid',
  'snippets/header-drawer.liquid': 'snippets__header-drawer.liquid',
  'blocks/ai_gen_block_361650c.liquid': 'blocks__ai_gen_block_361650c.liquid',
  'templates/index.json': 'templates__index.json',
  'sections/header-group.json': 'sections__header-group.json',
}
for (const [key, file] of Object.entries(files)) {
  try {
    await putAsset(key, fs.readFileSync(path.join(DIR, file), 'utf8'))
  } catch (e) {
    console.log('retry later', key, e.message)
    await new Promise((r) => setTimeout(r, 5000))
    await putAsset(key, fs.readFileSync(path.join(DIR, file), 'utf8'))
  }
}

const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${NEW}` }
)
console.log('publish', JSON.stringify(pub, null, 2))

function probe(html, headers) {
  const st = headers.get('server-timing') || ''
  return {
    stTheme: st.match(/theme;desc="(\d+)"/)?.[1],
    shopifyTheme: html.match(/"id":(\d+),"schema_name"/)?.[1],
    shopifyName: html.match(/"name":"([^"]+)","id":\d+/)?.[1]?.slice(0, 40),
    offerStrip: html.includes('lurvox-offer-strip'),
    save5: html.includes('SAVE5'),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: html.includes('Price increases in'),
    drawerLogin: html.includes('lurvox-drawer-login'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
    choosePlan: /Choose your plan/i.test(html),
  }
}

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const label of ['index', 'preview', 'root']) {
    const u =
      label === 'preview'
        ? `https://www.lurvox.in/?preview_theme_id=${NEW}&cb=${Date.now()}`
        : label === 'index'
          ? `https://www.lurvox.in/index?cb=${Date.now()}`
          : `https://www.lurvox.in/?cb=${Date.now()}`
    const r = await fetch(u, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' },
    })
    const html = await r.text()
    const p = probe(html, r.headers)
    console.log(i, label, p)
    if (p.offerStrip && p.save5 && p.priceIncreases && !p.oldLogin) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}
console.log('still stuck')
process.exit(1)
