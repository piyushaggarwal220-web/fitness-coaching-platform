import fs from 'node:fs'
import path from 'node:path'

const res = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
})
const html = await res.text()
fs.writeFileSync(path.join(process.cwd(), 'scripts/tmp-live-home-now.html'), html)

console.log('bytes', html.length, 'etag', res.headers.get('etag'))
console.log('section ids:')
for (const m of html.matchAll(/id="(shopify-section-[^"]+)"/g)) console.log(' ', m[1])

console.log('\nanchors:')
for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
  const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 55)
  if (/plan|league|talk|#|checkout/i.test(m[1]) || /PLAN|COACH|LEAGUE/i.test(text)) {
    console.log(' ', m[1], '|', text)
  }
}

for (const needle of [
  'home_blocks_v2',
  'GET THE 12-MONTH PLAN',
  'CHOOSE YOUR PLAN',
  'lurvox-talk-cta-highlight',
  'lurvox-urgency-countdown-end-v1',
  'lurvox-talk-pulse',
  'Talk To A Coach',
  'Book Consultation',
]) {
  console.log(needle, '=>', html.includes(needle))
}
