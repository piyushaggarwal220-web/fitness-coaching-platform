import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 300)}`)
  console.log('updated', key)
}

function rewriteOldSale(text) {
  return text
    .replace(/From ₹566\/mo/g, 'From ₹333/mo')
    .replace(/from ₹566\/mo/g, 'from ₹333/mo')
    .replace(/₹566\/mo/g, '₹333/mo')
    .replace(/≈ ₹19\/day/g, '≈ ₹333/mo')
    .replace(/≈ ₹15\/day/g, '≈ ₹283/mo')
    .replace(/≈ ₹10\/day/g, '≈ ₹250/mo')
    .replace(/₹3,?699/g, '₹2,999')
    .replace(/₹2,?699/g, '₹1,699')
    .replace(/₹1,?699/g, '₹999')
    .replace(/"3699"/g, '"2999"')
    .replace(/"2699"/g, '"1699"')
    .replace(/"1699"/g, '"999"')
    .replace(/"default": "₹3,699"/g, '"default": "₹2,999"')
    .replace(/"default": "₹2,699"/g, '"default": "₹1,699"')
    .replace(/"default": "₹1,699"/g, '"default": "₹999"')
}

// Note: chained ₹1,699→999 runs after 2,699→1,699 so new 6mo becomes 999 wrongly!
// Fix with placeholders.
function rewriteSafe(text) {
  return text
    .replace(/From ₹566\/mo/g, 'From ₹333/mo')
    .replace(/from ₹566\/mo/g, 'from ₹333/mo')
    .replace(/₹566\/mo/g, '₹333/mo')
    .replace(/≈ ₹19\/day/g, '≈ ₹333/mo')
    .replace(/≈ ₹15\/day/g, '≈ ₹283/mo')
    .replace(/≈ ₹10\/day/g, '≈ ₹250/mo')
    .replace(/₹3,?699/g, '__P12__')
    .replace(/₹2,?699/g, '__P6__')
    .replace(/₹1,?699/g, '__P3__')
    .replace(/__P12__/g, '₹2,999')
    .replace(/__P6__/g, '₹1,699')
    .replace(/__P3__/g, '₹999')
    .replace(/"3699"/g, '"__N12__"')
    .replace(/"2699"/g, '"__N6__"')
    .replace(/"1699"/g, '"__N3__"')
    .replace(/__N12__/g, '2999')
    .replace(/__N6__/g, '1699')
    .replace(/__N3__/g, '999')
}

for (const key of [
  'blocks/ai_gen_block_52353f6.liquid',
  'snippets/lurvox-plan-compare-inline.liquid',
  'sections/lurvox-plan-compare.liquid',
  'sections/lurvox-home-redesign.liquid',
]) {
  const val = await get(key)
  if (!val) {
    console.log('missing', key)
    continue
  }
  const next = rewriteSafe(val)
  if (next !== val) await put(key, next)
  else console.log('unchanged', key)
}

// Re-apply correct plan settings on index after any rewrite
const index = JSON.parse(await get('templates/index.json'))
function applyPlanSettings(s) {
  s.plan_1_enabled = false
  s.plan_2_price = '999'
  s.plan_2_original_price = '2499'
  s.plan_2_savings = '60% OFF · SAVE ₹1,500'
  s.plan_2_monthly = '≈ ₹333/month'
  s.plan_2_link = 'https://app.lurvox.in/checkout?plan=3_months'
  s.plan_3_price = '1699'
  s.plan_3_original_price = '4249'
  s.plan_3_savings = '60% OFF · SAVE ₹2,550'
  s.plan_3_monthly = '≈ ₹283/month'
  s.plan_3_link = 'https://app.lurvox.in/checkout?plan=6_months'
  s.plan_4_price = '2999'
  s.plan_4_original_price = '7499'
  s.plan_4_savings = '60% OFF · SAVE ₹4,500'
  s.plan_4_monthly = '≈ ₹250/month'
  s.plan_4_link = 'https://app.lurvox.in/checkout?plan=12_months'
  if ('col_1_price' in s) s.col_1_price = '₹999'
  if ('col_2_price' in s) s.col_2_price = '₹1,699'
  if ('col_3_price' in s) s.col_3_price = '₹2,999'
}

for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (!block?.settings) continue
    const s = block.settings
    if ('plan_2_price' in s || 'plan_3_price' in s || 'plan_4_price' in s) {
      applyPlanSettings(s)
    }
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'string' && /566/.test(v)) {
        s[k] = v.replace(/₹566\/mo/g, '₹333/mo').replace(/566\/mo/g, '333/mo')
      }
      if (typeof v === 'string' && /Start at ₹|START AT ₹|From ₹/.test(v)) {
        s[k] = rewriteSafe(v)
      }
    }
  }
}
await put('templates/index.json', JSON.stringify(index))

// Touch settings_data to bust cache
const sd = await get('config/settings_data.json')
if (sd) {
  const stamped = sd.replace(
    /("current"\s*:\s*\{)/,
    `$1\n  "lx_price_stamp": "${Date.now()}",`
  )
  if (stamped !== sd) await put('config/settings_data.json', stamped)
  else await put('config/settings_data.json', sd + '\n')
}

const html = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()
console.log({
  has999: /₹\s*999/.test(html),
  has1699: /₹\s*1,?699/.test(html),
  has2999: /₹\s*2,?999/.test(html),
  hasOld2699: /₹\s*2,?699/.test(html),
  hasOld3699: /₹\s*3,?699/.test(html),
  has566: /566/.test(html),
})
