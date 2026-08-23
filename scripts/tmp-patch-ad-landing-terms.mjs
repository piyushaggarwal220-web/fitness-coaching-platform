import fs from 'node:fs'

const p = 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'
let t = fs.readFileSync(p, 'utf8')
t = t.replace(
  "{%- assign refund_url = '/pages/refund-policy' -%}",
  "{%- assign terms_url = 'https://app.lurvox.in/terms' -%}"
)
t = t.replace(
  /<p class="lx-ad__risk">[\s\S]*?<\/p>/,
  `<p class="lx-ad__risk">
      Refunds and guarantees (if any) are only in our
      <a href="{{ terms_url }}" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>.
    </p>`
)
fs.writeFileSync(p, t)
console.log('ad ok', !/full refund within 7 days/i.test(t))
