/**
 * Append offer overlay to lurvox-hide-1month.js on every theme that has it.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MARKER = '/* lurvox-offer-overlay-v2 */'

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('bad gql: ' + text.slice(0, 200))
  }
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function getAsset(themeId, key) {
  const r = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await r.text()
  if (!text) return null
  try {
    return JSON.parse(text).asset || null
  } catch {
    console.log('bad asset json', themeId, key, text.slice(0, 120))
    return null
  }
}

async function putAsset(themeId, key, value) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await r.text()
  const j = JSON.parse(text)
  if (j.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(j.errors)}`)
  return j.asset
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const mainNum = main.id.split('/').pop()
const overlayAsset = await getAsset(mainNum, 'assets/lurvox-offer-overlay.js')
if (!overlayAsset?.value) throw new Error('overlay asset missing on MAIN')
console.log('overlay bytes', overlayAsset.value.length, overlayAsset.public_url)

// Prefer themes that likely map near frozen cache
const priority = ['161389281531', '161390362875', mainNum, '161375289595']
const ordered = [
  ...priority.map((id) => themes.themes.nodes.find((t) => t.id.endsWith(id))).filter(Boolean),
  ...themes.themes.nodes.filter((t) => !priority.includes(t.id.split('/').pop())),
]

for (const t of ordered) {
  const id = t.id.split('/').pop()
  try {
    const hide = await getAsset(id, 'assets/lurvox-hide-1month.js')
    if (!hide?.value) {
      console.log('skip', id)
      continue
    }
    let next = hide.value
    const idx = next.indexOf('/* lurvox-offer-overlay')
    if (idx >= 0) next = next.slice(0, idx).trimEnd()
    next = `${next}\n\n${MARKER}\n${overlayAsset.value}\n`
    const put = await putAsset(id, 'assets/lurvox-hide-1month.js', next)
    console.log('ok', id, t.role, put.public_url)
  } catch (e) {
    console.log('fail', id, e.message.slice(0, 160))
  }
}

const frozen =
  'https://www.lurvox.in/cdn/shop/t/21/assets/lurvox-hide-1month.js?v=173622349671609679121785654262'
const mainHide = await getAsset(mainNum, 'assets/lurvox-hide-1month.js')
for (const u of [frozen, mainHide?.public_url].filter(Boolean)) {
  const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'x=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache' },
  })
  const txt = await r.text()
  console.log({
    u: u.slice(0, 110),
    status: r.status,
    hasOverlay: /lurvoxOfferOverlay|SAVE5|SALE ENDS IN/.test(txt),
    len: txt.length,
  })
}
