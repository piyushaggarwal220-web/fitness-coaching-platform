import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const MAIN = 'gid://shopify/OnlineStoreTheme/161375289595'
const SPARE = 'gid://shopify/OnlineStoreTheme/161294057723'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function put(themeNumeric, key, value) {
  const r = await fetch(`${API}/themes/${themeNumeric}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('touched', themeNumeric, key)
}

async function get(themeNumeric, key) {
  const r = await fetch(
    `${API}/themes/${themeNumeric}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  return j.asset?.value || ''
}

// Cache-bust stamp in layout
for (const id of ['161375289595', '161294057723']) {
  let layout = await get(id, 'layout/theme.liquid')
  if (!layout) continue
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
  layout = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + layout
  await put(id, 'layout/theme.liquid', layout)
}

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    hasTap: html.includes('window.location.href = link'),
    hasCtaButton: /data-cta-button/.test(html),
    hasAddToCart: /ADD TO CART/i.test(html),
    seats: html.includes('data-lurvox-seats-filled'),
    prices: [...html.matchAll(/<div\b[^>]*data-plan-price="([^"]+)"/g)].map((m) => m[1]),
  }
}

async function home() {
  return (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
  ).text()
}

console.log('BEFORE', probe(await home()))

console.log('Publish bounce: spare...')
console.log(
  JSON.stringify(
    await gql(
      `mutation($id: ID!) { themePublish(id: $id) { theme { id name role } userErrors { message } } }`,
      { id: SPARE }
    ),
    null,
    2
  )
)
await new Promise((r) => setTimeout(r, 6000))
console.log('MID', probe(await home()))

console.log('Publish bounce: New changes back...')
console.log(
  JSON.stringify(
    await gql(
      `mutation($id: ID!) { themePublish(id: $id) { theme { id name role } userErrors { message } } }`,
      { id: MAIN }
    ),
    null,
    2
  )
)

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const p = probe(await home())
  console.log(i, JSON.stringify(p))
  if (p.hasTap && !p.hasCtaButton && !p.hasAddToCart) {
    console.log('CACHE FLUSHED — tap-to-plan live')
    process.exit(0)
  }
}

console.log('Still stale')
process.exit(1)
