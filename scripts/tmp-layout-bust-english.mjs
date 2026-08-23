import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161454620923
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const get = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await get.json()).asset.value
const stamp = `<!-- lurvox-cache-bust ${Date.now()} -->`
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, stamp)
} else {
  layout = layout.replace('</head>', `${stamp}\n</head>`)
}
const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
if (!put.ok) throw new Error(await put.text())
console.log('layout busted', stamp)

await new Promise((r) => setTimeout(r, 6000))
const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?v=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 verify' },
  })
).text()
console.log({
  ghar: /ghar[-\s]?ka[-\s]?khana/i.test(html),
  homeCooked: /Home cooked food\. Keep it simple/.test(html),
  stampInHtml: html.includes(stamp),
})
