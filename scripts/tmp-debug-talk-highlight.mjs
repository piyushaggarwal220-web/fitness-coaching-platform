import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const layout = await fetch(
  `${REST}/themes/161086767355/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

fs.writeFileSync('scripts/tmp-live-layout-theme.liquid', layout)
console.log('len', layout.length)
console.log('has talk highlight marker', layout.includes('lurvox-talk-cta-highlight'))
console.log('has cache bust', /lurvox-cache-bust/.test(layout))
console.log('has Talk to a coach label js', layout.includes("span.textContent = 'Talk to a coach'"))

const at = layout.indexOf('lurvox-talk-cta-highlight')
if (at >= 0) {
  console.log('\n--- snippet around marker ---\n')
  console.log(layout.slice(at - 80, at + 500))
} else {
  console.log('MARKER MISSING - searching talk-to-a-coach / header-actions')
  for (const needle of ['talk-to-a-coach', 'header-actions__action', '</body>']) {
    console.log(needle, layout.includes(needle))
  }
  console.log('tail:\n', layout.slice(-800))
}

const html = fs.readFileSync('scripts/tmp-live-home-now.html', 'utf8')
// Find header talk links in HTML
let from = 0
let n = 0
while (n < 8) {
  const at2 = html.toLowerCase().indexOf('talk-to-a-coach', from)
  if (at2 < 0) break
  console.log('\nhtml talk link context', n, html.slice(Math.max(0, at2 - 180), at2 + 220).replace(/\s+/g, ' '))
  from = at2 + 1
  n += 1
}
