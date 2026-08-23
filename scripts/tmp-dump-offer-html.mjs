import fs from 'fs'
import path from 'path'

const u = `https://www.lurvox.in/?preview_theme_id=161390362875&cb=${Date.now()}`
const r = await fetch(u, {
  headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' },
})
const html = await r.text()
const out = path.join(process.env.TEMP, 'lurvox-offer-probe.html')
fs.writeFileSync(out, html)
console.log('status', r.status, 'len', html.length, 'saved', out)
console.log('headers', Object.fromEntries([...r.headers.entries()].filter(([k]) => /cache|cf-|x-|age|server|content/i.test(k))))

const themes = [...html.matchAll(/Shopify\.theme\s*=\s*(\{[^;]+)/g)].map((m) => m[1].slice(0, 200))
console.log('Shopify.theme snippets', themes)

const cdn = [...html.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1])
console.log('cdn theme nums', [...new Set(cdn)].slice(0, 10))

const idx = html.search(/EXISTING CLIENT/i)
console.log('EXISTING CLIENT idx', idx)
if (idx >= 0) console.log(html.slice(Math.max(0, idx - 200), idx + 300).replace(/\s+/g, ' '))

for (const n of [
  'lurvox-offer-strip',
  'SAVE5',
  'SALE ENDS IN',
  'Price increases in',
  'lurvox-drawer-login',
  'LIMITED OFFER',
  'Choose your plan',
  'lurvox-heading-timer',
  'data-countdown-key',
]) {
  console.log(n, html.includes(n))
}

// find client login section markers
const loginIdx = html.search(/client.?login|lurvox-client|offer-strip/i)
console.log('login-ish idx', loginIdx)
if (loginIdx >= 0) console.log(html.slice(loginIdx, loginIdx + 400).replace(/\s+/g, ' '))
