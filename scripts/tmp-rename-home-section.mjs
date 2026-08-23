/**
 * Shopify's storefront kept serving a stale render of the homepage section even
 * after the theme files were updated. Renaming the section key changes the
 * section's cache identity, which forces a fresh render.
 */
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = '161086767355'

const OLD_KEY = 'blocks_C9E4qf'
const NEW_KEY = 'home_blocks_v2'

const raw = await fetch(`${REST}/themes/${THEME}/assets.json?asset[key]=templates/index.json`, {
  headers,
}).then((r) => r.json())
const value = raw.asset.value
fs.writeFileSync(path.join(process.cwd(), 'scripts/tmp-index-backup.json'), value)

const index = JSON.parse(value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
if (!index.sections[OLD_KEY]) {
  console.log('old key not present; sections:', Object.keys(index.sections))
  process.exit(0)
}

index.sections[NEW_KEY] = index.sections[OLD_KEY]
delete index.sections[OLD_KEY]
index.order = index.order.map((key) => (key === OLD_KEY ? NEW_KEY : key))

const put = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'templates/index.json', value: JSON.stringify(index, null, 2) },
  }),
})
console.log('index rewrite:', put.status, 'order:', index.order.join(', '))

const check = async () => {
  const res = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  })
  const html = await res.text()
  return {
    sectionRenamed: html.includes('home_blocks_v2'),
    newLabel: html.includes('GET THE 12-MONTH PLAN'),
    talkCss: html.includes('lurvox-talk-cta-highlight'),
    countdown: html.includes('lurvox-urgency-countdown-end-v1'),
    deadAnchor: html.includes('#shopify-section-blocks_C9E4qf'),
  }
}

for (let i = 0; i < 8; i += 1) {
  await new Promise((r) => setTimeout(r, 7000))
  console.log(i, JSON.stringify(await check()))
}
