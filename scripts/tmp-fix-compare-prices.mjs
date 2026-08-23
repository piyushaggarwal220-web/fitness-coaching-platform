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

const index = JSON.parse(await get('templates/index.json'))
const hits = []
for (const [sid, section] of Object.entries(index.sections || {})) {
  const type = section.type
  const s = section.settings || {}
  const dump = JSON.stringify(section)
  if (/2699|3699|1699|col_.*price|plan-compare|compare/.test(dump) || /compare|plan/.test(type || '')) {
    hits.push({
      sid,
      type,
      col_1_price: s.col_1_price,
      col_2_price: s.col_2_price,
      col_3_price: s.col_3_price,
      hasOld: /2,?699|3,?699/.test(dump),
    })
  }
  // rewrite any leftover old sale prices in section/block settings strings
  const fix = (obj) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        obj[k] = v
          .replace(/₹3,?699/g, '__P12__')
          .replace(/₹2,?699/g, '__P6__')
          .replace(/₹1,?699/g, '__P3__')
          .replace(/__P12__/g, '₹2,999')
          .replace(/__P6__/g, '₹1,699')
          .replace(/__P3__/g, '₹999')
          .replace(/From ₹566\/mo/g, 'From ₹333/mo')
      } else if (typeof v === 'object') fix(v)
    }
  }
  fix(section)
  if ('col_1_price' in s || 'col_2_price' in s || 'col_3_price' in s) {
    s.col_1_price = '₹999'
    s.col_2_price = '₹1,699'
    s.col_3_price = '₹2,999'
  }
}
console.log('compare-ish sections', hits)
await put('templates/index.json', JSON.stringify(index))

// Also check page templates
for (const key of ['templates/page.json', 'templates/page.plans.json', 'templates/page.coaching-plans.json']) {
  const raw = await get(key)
  if (!raw) continue
  let changed = false
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    continue
  }
  for (const section of Object.values(json.sections || {})) {
    const s = section.settings || {}
    if ('col_1_price' in s || 'col_2_price' in s || 'col_3_price' in s) {
      s.col_1_price = '₹999'
      s.col_2_price = '₹1,699'
      s.col_3_price = '₹2,999'
      changed = true
    }
  }
  if (changed) await put(key, JSON.stringify(json))
}

const html = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()
console.log({
  hasOld2699: /₹\s*2,?699/.test(html),
  hasOld3699: /₹\s*3,?699/.test(html),
  has999: /₹\s*999/.test(html),
  has1699: /₹\s*1,?699/.test(html),
  has2999: /₹\s*2,?999/.test(html),
})
