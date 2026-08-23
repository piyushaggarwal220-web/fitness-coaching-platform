import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
console.log('main', main.id)

const assets = await (await fetch(`${API}/themes/${main.id}/assets.json`, { headers })).json()
const candidates = (assets.assets || [])
  .map((a) => a.key)
  .filter((k) =>
    /(header|footer|floating|fab|index|talk|layout|menu|client-login)/i.test(k)
  )

async function get(key) {
  const r = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}
async function put(key, value) {
  const r = await fetch(`${API}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', key)
}

let changed = 0
for (const key of candidates) {
  const value = await get(key)
  if (!value || !value.includes('/pages/talk-to-a-coach')) continue
  console.log('hit', key)
  await put(key, value.replaceAll('/pages/talk-to-a-coach', '/pages/book-a-free-call'))
  changed += 1
}
console.log('files updated', changed)

// Final verify clean page
const html = await (
  await fetch(`https://www.lurvox.in/pages/book-a-free-call?final=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126' },
  })
).text()
console.log({
  url: '/pages/book-a-free-call',
  has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
  has179: /₹179/.test(html),
  plans: {
    m3: /3 Months/i.test(html),
    m6: /6 Months/i.test(html),
    m12: /12 Months/i.test(html),
  },
})
