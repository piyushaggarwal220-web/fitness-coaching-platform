import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

for (const key of [
  'sections/lurvox-page-content.liquid',
  'templates/page.json',
  'templates/page.plans.json',
]) {
  const val = await get(key)
  console.log('\n===', key, val ? `bytes ${val.length}` : 'MISSING')
  if (!val) continue
  if (key.endsWith('.json')) {
    const data = JSON.parse(val)
    console.log(JSON.stringify(data, null, 2).slice(0, 1500))
  } else {
    console.log(val.slice(0, 2000))
    if (/1 Month|plan_1|page\.content|page\.body/i.test(val)) {
      console.log('--- matches ---')
      for (const m of val.matchAll(/.*(?:1 Month|plan_1|page\.content|page\.body).*/gi)) {
        console.log(m[0].slice(0, 200))
      }
    }
  }
}

// Render the page content section
const sec = await fetch(
  `https://www.lurvox.in/pages/plans?sections=lurvox-page-content&cb=${Date.now()}`,
  { headers: { 'User-Agent': 'Mozilla/5.0' } }
).then(async (r) => ({ status: r.status, text: await r.text() }))
console.log('\nsection render status', sec.status)
console.log(sec.text.replace(/\s+/g, ' ').slice(0, 800))
