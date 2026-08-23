import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = '161086767355'

const raw = await fetch(`${REST}/themes/${THEME}/assets.json?asset[key]=config/settings_data.json`, {
  headers,
}).then((r) => r.json())
const settings = JSON.parse(raw.asset.value)
const current = settings.current
if (!current || typeof current !== 'object') throw new Error('unexpected settings_data shape')
current.lurvox_cache_bust = Date.now()

const put = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'config/settings_data.json', value: JSON.stringify(settings, null, 2) },
  }),
})
console.log('settings_data write:', put.status)

const check = async () => {
  const res = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  })
  const html = await res.text()
  return {
    etag: (res.headers.get('etag') || '').slice(-14),
    newLabel: html.includes('GET THE 12-MONTH PLAN'),
    talkCss: html.includes('lurvox-talk-cta-highlight'),
    countdown: html.includes('lurvox-urgency-countdown-end-v1'),
  }
}

for (let i = 0; i < 8; i += 1) {
  await new Promise((r) => setTimeout(r, 7000))
  console.log(i, JSON.stringify(await check()))
}
