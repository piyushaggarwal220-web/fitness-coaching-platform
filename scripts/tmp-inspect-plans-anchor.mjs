import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const themeId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`${key} ${JSON.stringify(json).slice(0, 200)}`)
  return json.asset.value
}

const snippet = await getAsset('snippets/lurvox-plan-compare-inline.liquid')
console.log('snippet start:', snippet.slice(0, 180))
console.log('snippet has id=plans:', snippet.includes('id="plans"'))

const index = await getAsset('templates/index.json')
fs.writeFileSync('scripts/tmp-index-for-plans.json', index)
const markers = [
  'plan-compare',
  'lx-matrix',
  'lurvox-plan-compare',
  'conversion-boost',
  'sales-closer',
  'home_blocks',
]
for (const m of markers) {
  console.log(m, 'count', (index.match(new RegExp(m, 'g')) || []).length)
}

// print custom_liquid values that mention matrix/plans
const re = /"custom_liquid"\s*:\s*"((?:\\.|[^"\\])*)"/g
let match
let n = 0
while ((match = re.exec(index)) && n < 30) {
  const raw = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  if (/matrix|plan-compare|conversion-boost|sales-closer|#plans|id=.plans/i.test(raw)) {
    console.log('--- custom_liquid ---')
    console.log(raw.slice(0, 300))
  }
  n++
}
