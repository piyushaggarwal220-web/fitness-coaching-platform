import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const j = await fetch(
    `${REST}/themes/161086767355/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  return j.asset?.value ?? ''
}

const liquid = await get('blocks/ai_gen_block_8d967d7.liquid')
fs.writeFileSync('scripts/tmp-fetch-blocks-ai_gen_block_8d967d7.liquid', liquid)
console.log('liquid len', liquid.length)

// Find href / button_link usage
const lines = liquid.split('\n')
for (let i = 0; i < lines.length; i++) {
  if (/button_link|href|CHOOSE|cta/i.test(lines[i])) {
    console.log(String(i + 1).padStart(4), lines[i].slice(0, 160))
  }
}

const html = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}`, {
  cache: 'no-store',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
}).then((r) => r.text())
fs.writeFileSync('scripts/tmp-live-home-now.html', html)

const checks = {
  dead: (html.match(/#shopify-section-blocks_C9E4qf/g) || []).length,
  twelve: (html.match(/app\.lurvox\.in\/plans\/12-months/g) || []).length,
  getLabel: html.includes('GET THE 12-MONTH PLAN'),
  chooseLabel: (html.match(/CHOOSE YOUR PLAN/g) || []).length,
  countdown: html.includes('lurvox-urgency-countdown-end-v1'),
  talkCss: html.includes('lurvox-talk-cta-highlight'),
  fabPulse: html.includes('lurvox-talk-pulse'),
  fabTalk: html.includes('Talk To A Coach'),
  startAutoplay: html.includes('startAutoplay'),
  cacheBust: /lurvox-cache-bust:\s*\d+/.test(html),
}
console.log('\nlive html checks', checks)

// Extract CTA anchors
for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>\s*(GET THE 12-MONTH PLAN|CHOOSE YOUR PLAN)/gi)) {
  console.log('CTA', m[2], '->', m[1])
}
