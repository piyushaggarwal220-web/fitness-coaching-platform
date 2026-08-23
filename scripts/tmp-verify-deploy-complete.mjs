import fs from 'node:fs'

const url = `https://www.lurvox.in/?cb=${Date.now()}&preview_theme_id=161086767355`
const res = await fetch(url, {
  cache: 'no-store',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
  },
  redirect: 'follow',
})
const html = await res.text()
fs.writeFileSync('scripts/tmp-live-home-now.html', html)
console.log('status', res.status, 'final', res.url, 'len', html.length)
console.log('title snippet:', html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0]?.slice(0, 120))
console.log('has body', html.includes('<body'))
console.log('has LURVOX', /lurvox/i.test(html))
console.log('password page?', /password|shopify.shop.password/i.test(html))
console.log('challenge?', /challenge|cf-browser|captcha/i.test(html))

const checks = {
  'dead anchor gone': !html.includes('/#shopify-section-blocks_C9E4qf'),
  '12-month cta present': html.includes('https://app.lurvox.in/plans/12-months'),
  'new cta label': html.includes('GET THE 12-MONTH PLAN') || html.includes('CHOOSE YOUR PLAN'),
  'countdown persistence': html.includes('lurvox-urgency-countdown-end-v1'),
  'talk cta highlight css': html.includes('lurvox-talk-cta-highlight'),
  'talk cta label js': html.includes('Talk to a coach'),
  'fab label': html.includes('Talk To A Coach') || html.includes('Book Consultation'),
  'fab pulse': html.includes('lurvox-talk-pulse'),
  'league redirect intact': html.includes('/pages/league'),
  'autoplay startAutoplay': html.includes('startAutoplay'),
  'data-autoplay true': /data-autoplay\s*=\s*["']true["']/i.test(html),
}
for (const [k, v] of Object.entries(checks)) {
  console.log(v ? 'OK  ' : 'FAIL', k)
}

// Asset markers from theme files via Admin API are more reliable than CDN HTML
import path from 'node:path'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const themeId = 161086767355
async function get(key) {
  const j = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  return j.asset?.value ?? ''
}
const [plan, fab, layout, index] = await Promise.all([
  get('blocks/ai_gen_block_361650c.liquid'),
  get('sections/mobile-floating-bar.liquid'),
  get('layout/theme.liquid'),
  get('templates/index.json'),
])
console.log('\n=== theme assets ===')
console.log('countdown key in plan block:', plan.includes('lurvox-urgency-countdown-end-v1'))
console.log('fab Talk To A Coach:', fab.includes('Talk To A Coach'))
console.log('fab pulse:', fab.includes('lurvox-talk-pulse'))
console.log('layout talk highlight:', layout.includes('lurvox-talk-cta-highlight'))
console.log('index dead anchors:', (index.match(/shopify-section-blocks_C9E4qf/g) || []).length)
console.log(
  'index 12m button_link count:',
  (index.match(/app\.lurvox\.in\/plans\/12-months/g) || []).length
)
console.log('index GET THE 12-MONTH:', index.includes('GET THE 12-MONTH PLAN'))
