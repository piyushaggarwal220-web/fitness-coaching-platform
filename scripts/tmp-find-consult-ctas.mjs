import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  ).then((r) => r.json())
  return j.asset?.value || ''
}

for (const key of [
  'templates/index.json',
  'sections/footer-group.json',
  'sections/header-group.json',
  'sections/mobile-floating-bar.liquid',
]) {
  const raw = await get(key)
  const hits = []
  for (const re of [
    /Book a free consultation[^"]*/gi,
    /consultation_url[^,]{0,120}/gi,
    /wa\.me\/919220451577[^"]*/gi,
    /talk-to-a-coach/gi,
    /payment_help_url[^,]{0,120}/gi,
  ]) {
    let m
    while ((m = re.exec(raw))) hits.push(m[0].slice(0, 140))
  }
  console.log('\n==', key, '==')
  console.log([...new Set(hits)].slice(0, 25))
}
