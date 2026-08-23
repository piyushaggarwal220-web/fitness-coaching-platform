import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]

async function get(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 200))
  return json.asset.value
}

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json).slice(0, 300))
  console.log('ok', themeId, key)
}

function patchMatrix(index) {
  let next = index
  const replacements = [
    [
      'href=\\"https://app.lurvox.in/plans/3-months\\">Choose</a>',
      'href=\\"https://app.lurvox.in/checkout?plan=3_months\\">Start · ₹999</a>',
    ],
    [
      'href=\\"https://app.lurvox.in/plans/6-months\\">Choose</a>',
      'href=\\"https://app.lurvox.in/checkout?plan=6_months\\">Start · ₹1,699</a>',
    ],
    [
      'href=\\"https://app.lurvox.in/plans/12-months\\">Choose</a>',
      'href=\\"https://app.lurvox.in/checkout?plan=12_months\\">Start · ₹2,999</a>',
    ],
    // unescaped variants
    [
      'href="https://app.lurvox.in/plans/3-months">Choose</a>',
      'href="https://app.lurvox.in/checkout?plan=3_months">Start · ₹999</a>',
    ],
    [
      'href="https://app.lurvox.in/plans/6-months">Choose</a>',
      'href="https://app.lurvox.in/checkout?plan=6_months">Start · ₹1,699</a>',
    ],
    [
      'href="https://app.lurvox.in/plans/12-months">Choose</a>',
      'href="https://app.lurvox.in/checkout?plan=12_months">Start · ₹2,999</a>',
    ],
  ]
  let changed = 0
  for (const [from, to] of replacements) {
    if (next.includes(from)) {
      next = next.split(from).join(to)
      changed++
    }
  }
  return { next, changed }
}

for (const themeId of themes) {
  const index = await get(themeId, 'templates/index.json')
  // debug nearby choose
  const i = index.indexOf('plans/3-months')
  console.log(themeId, '3-months idx', i, i >= 0 ? index.slice(i - 20, i + 80) : 'none')
  const { next, changed } = patchMatrix(index)
  console.log(themeId, 'replacements', changed)
  if (changed > 0) {
    fs.writeFileSync(`scripts/tmp-index-matrix-${themeId}.json`, next)
    await put(themeId, 'templates/index.json', next)
  }
}
console.log('done')
