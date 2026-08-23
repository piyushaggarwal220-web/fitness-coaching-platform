import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const THEME = '161086767355'

const layout = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=layout/theme.liquid`,
  { headers }
).then((r) => r.json())
const value = layout.asset.value
fs.writeFileSync(path.join(process.cwd(), 'scripts/tmp-live-layout-theme.liquid'), value)
console.log('layout length', value.length)
const markers = [...value.matchAll(/lurvox[a-z0-9-]*/gi)].map((m) => m[0])
console.log('lurvox markers in layout:', [...new Set(markers)].join(', '))

const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0 verify' },
}).then((r) => r.text())
fs.writeFileSync(path.join(process.cwd(), 'scripts/tmp-live-home.html'), html)
console.log('\nmarkers found in live html:')
for (const m of [...new Set(markers)]) console.log(' ', m, html.includes(m))
