import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = '161086767355'

const res = await fetch(`${REST}/themes/${THEME}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ theme: { id: Number(THEME), role: 'main' } }),
})
console.log('republish status', res.status)
console.log(JSON.stringify(await res.json()).slice(0, 400))

const check = async () => {
  const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 verify' },
  }).then((r) => r.text())
  return {
    newLabel: html.includes('GET THE 12-MONTH PLAN'),
    talkCss: html.includes('lurvox-talk-cta-highlight'),
    countdown: html.includes('lurvox-urgency-countdown-end-v1'),
    deadAnchor: html.includes('#shopify-section-blocks_C9E4qf'),
  }
}

for (let i = 0; i < 6; i += 1) {
  await new Promise((r) => setTimeout(r, 8000))
  console.log(i, JSON.stringify(await check()))
}
