import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

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

const inline = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
await put('snippets/lurvox-plan-compare-inline.liquid', inline)

// bust
const get = async (key) => {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return JSON.parse(await res.text()).asset.value
}
const sd = await get('config/settings_data.json')
await put(
  'config/settings_data.json',
  sd.replace(/("current"\s*:\s*\{)/, `$1\n  "lx_price_stamp": "${Date.now()}",`)
)

const html = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()
console.log({
  hasOld2699: /₹\s*2,?699/.test(html),
  hasOld3699: /₹\s*3,?699/.test(html),
  hasOld1499: /₹\s*1,?499/.test(html),
  has999: /₹\s*999/.test(html),
  has1699: /₹\s*1,?699/.test(html),
  has2999: /₹\s*2,?999/.test(html),
  matrixSnippet: (html.match(/lx-matrix__table[\s\S]{0,400}/) || [''])[0]
    .replace(/\s+/g, ' ')
    .slice(0, 280),
})
