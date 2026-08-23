import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()
const themeGid = main.id
console.log('theme:', main.name, themeId)

async function getAsset(key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  return j.asset
}

async function putAsset(key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j)}`)
  return j.asset
}

async function deleteAsset(key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { method: 'DELETE', headers: H }
  )
  const text = await r.text()
  console.log(`DELETE ${key}:`, r.status, text.slice(0, 120))
}

// 1. Confirm current header-group / index still omit the section
for (const key of ['sections/header-group.json', 'templates/index.json']) {
  const a = await getAsset(key)
  const j = JSON.parse(a.value)
  console.log(key, 'has hide_1month?', Boolean(j.sections?.lurvox_hide_1month), '| order=', j.order)
}

// 2. Delete the section file so it cannot render even if a stale group still references it
await deleteAsset('sections/lurvox-hide-1month.liquid')

// 3. Touch layout/theme.liquid to force storefront recompile
const layout = await getAsset('layout/theme.liquid')
const stamp = `<!-- lurvox-cache-bust ${Date.now()} -->`
let layoutValue = layout.value
if (layoutValue.includes('lurvox-cache-bust')) {
  layoutValue = layoutValue.replace(/<!-- lurvox-cache-bust \d+ -->/, stamp)
} else {
  layoutValue = layoutValue.replace('</head>', `  ${stamp}\n</head>`)
}
await putAsset('layout/theme.liquid', layoutValue)
console.log('touched layout/theme.liquid with', stamp)

// 4. Also re-PUT header-group and index with a whitespace-preserving rewrite so Shopify marks them updated
for (const key of ['sections/header-group.json', 'templates/index.json']) {
  const a = await getAsset(key)
  const j = JSON.parse(a.value)
  // ensure still clean
  delete j.sections?.lurvox_hide_1month
  if (Array.isArray(j.order)) j.order = j.order.filter((k) => k !== 'lurvox_hide_1month')
  j.__lurvox_cache_bust = Date.now() // will strip? no, Shopify may reject unknown root keys
  // don't add unknown root keys — just re-stringify
  const cleaned = JSON.parse(JSON.stringify(j))
  delete cleaned.__lurvox_cache_bust
  await putAsset(key, JSON.stringify(cleaned, null, 2))
  console.log('re-wrote', key)
}

console.log('\ndone')
