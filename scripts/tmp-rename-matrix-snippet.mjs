import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MAIN = 161429127419
const OFFER = 161391804667

async function get(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

async function put(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(json).slice(0, 250)}`)
  console.log('updated', themeId, key)
}

const liquid = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
const stamped =
  `{% comment %} price matrix v999-${Date.now()} {% endcomment %}\n` + liquid

for (const themeId of [MAIN, OFFER]) {
  await put(themeId, 'snippets/lurvox-plan-compare-inline-v999.liquid', stamped)
  const index = JSON.parse(await get(themeId, 'templates/index.json'))
  let changed = false
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.includes("render 'lurvox-plan-compare-inline'")) {
        obj[k] = v.replace(
          "render 'lurvox-plan-compare-inline'",
          "render 'lurvox-plan-compare-inline-v999'"
        )
        changed = true
      } else if (typeof v === 'object') walk(v)
    }
  }
  walk(index)
  if (changed) await put(themeId, 'templates/index.json', JSON.stringify(index))
  else console.log('no render change', themeId)
}

await new Promise((r) => setTimeout(r, 6000))
for (const url of [
  `https://www.lurvox.in/`,
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://www.lurvox.in/?view=&cb=${Date.now()}`,
]) {
  const html = await (await fetch(url, { headers: { 'User-Agent': `v999/${Date.now()}` } })).text()
  console.log(url, {
    v999marker: html.includes('price matrix v999'),
    old2699: /₹\s*2,?699/.test(html),
    prices: (html.match(/<strong>₹[^<]+<\/strong>/g) || []).slice(0, 6),
  })
}
