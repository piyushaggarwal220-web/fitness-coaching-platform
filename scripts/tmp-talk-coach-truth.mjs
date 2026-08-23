const html = await fetch('https://www.lurvox.in/pages/talk-coach?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

console.log('stamp', html.includes('lurvox-talk-wa-redirect'))
console.log('location.replace wa', /location\.replace\([^)]*wa\.me\/919220451577\?text=i%20want%20a%20free/.test(html))
console.log(
  'meta refresh',
  [...html.matchAll(/content="0;url=([^"]+)"/g)].map((m) => m[1])
)
console.log(
  'replaces',
  [...html.matchAll(/location\.replace\(([^)]+)\)/g)].map((m) => m[1]).slice(0, 5)
)

// Find "free consultation" context
const i = html.toLowerCase().indexOf('free consultation')
console.log('context', html.slice(Math.max(0, i - 80), i + 120).replace(/\s+/g, ' '))

// Admin page body
import fs from 'node:fs'
import path from 'node:path'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const pages = (
  await (
    await fetch(`${REST}/pages.json?handle=talk-coach`, {
      headers: { 'X-Shopify-Access-Token': token },
    })
  ).json()
).pages
console.log(
  'admin body',
  pages[0]?.body_html?.slice(0, 250),
  'id',
  pages[0]?.id,
  'updated',
  pages[0]?.updated_at
)
