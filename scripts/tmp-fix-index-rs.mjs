import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`GET ${key} ${res.status}`)
  return (await res.json()).asset.value
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT ${key} ${res.status} ${text.slice(0, 500)}`)
  return text.slice(0, 200)
}

const themes = await (await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })).json()
const live = themes.themes.find((t) => t.role === 'main')
let index = await getAsset(live.id, 'templates/index.json')

// Inspect what the "rupee" actually is
const idx = index.indexOf('plan_2_monthly')
const slice = index.slice(idx, idx + 80)
const codes = [...slice].map((c) => `${c}(${c.codePointAt(0).toString(16)})`).join(' ')

// Replace common rupee forms
const before = (index.match(/\u20b9/g) || []).length
const before2 = (index.match(/₹/g) || []).length
const before3 = (index.match(/Rs\./g) || []).length

index = index
  .replace(/\u20b9/g, 'Rs ')
  .replace(/₹/g, 'Rs ')
  .replace(/&#8377;|&amp;#8377;|&rupee;/gi, 'Rs ')
  .replace(/Rs {2,}/g, 'Rs ')

// Also explicitly rewrite known plan strings
const rewrites = {
  '₹499/month': 'Rs 499/month',
  '≈ ₹333/month': '≈ Rs 333/month',
  '≈ ₹283/month': '≈ Rs 283/month',
  '≈ ₹250/month': '≈ Rs 250/month',
  'SAVE ₹498': 'SAVE Rs 498',
  'SAVE ₹1,295': 'SAVE Rs 1,295',
  'SAVE ₹2,989': 'SAVE Rs 2,989',
}
for (const [from, to] of Object.entries(rewrites)) {
  // Also try escaped slash variants in JSON source
  index = index.split(from).join(to)
  index = index.split(from.replace('/', '\\/')).join(to.replace('/', '\\/'))
}

const putRes = await putAsset(live.id, 'templates/index.json', index)
const verify = await getAsset(live.id, 'templates/index.json')
const monthly = [...verify.matchAll(/"(plan_\d+_(?:monthly|savings))"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map(
  (m) => ({ key: m[1], value: JSON.parse(`"${m[2]}"`) })
)

fs.writeFileSync('scripts/tmp-live-index.json', verify)

console.log(
  JSON.stringify(
    {
      themeId: live.id,
      slice,
      codes: codes.slice(0, 400),
      beforeU20b9: before,
      beforeSymbol: before2,
      afterU20b9: (verify.match(/\u20b9/g) || []).length,
      afterSymbol: (verify.match(/₹/g) || []).length,
      monthly,
      putRes,
    },
    null,
    2
  )
)
