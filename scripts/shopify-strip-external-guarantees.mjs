import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function patchCloser() {
  const p = path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid')
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    /\{%- assign refund_url[\s\S]*?results_url[\s\S]*?-%\}/,
    "{%- assign terms_url = 'https://app.lurvox.in/terms' -%}"
  )
  t = t.replace(
    /<div class="lx-close__guarantee">[\s\S]*?<\/div>/,
    `<div class="lx-close__guarantee">
    <p>
      Service rules, refunds, and any guarantees are only in our
      <a href="{{ terms_url }}" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>.
    </p>
  </div>`
  )
  fs.writeFileSync(p, t)
  console.log('closer ok', t.includes('Terms &amp; Conditions') && !t.includes('Delivery promise'))
}

function patchConv() {
  const p = path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid')
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    "{%- assign refund_url = '/pages/refund-policy' -%}",
    "{%- assign terms_url = 'https://app.lurvox.in/terms' -%}"
  )
  t = t.replace(
    '<p class="lx-conv__trust-item"><strong>Plan late?</strong> Full refund path</p>',
    '<p class="lx-conv__trust-item"><strong>Terms</strong> apply to every plan</p>'
  )
  t = t.replace(
    /<div class="lx-conv__risk">[\s\S]*?<\/div>/,
    `<div class="lx-conv__risk">
      <p>
        Refunds and guarantees (if any) are only as stated in our
        <a href="{{ terms_url }}" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>.
      </p>
    </div>`
  )
  fs.writeFileSync(p, t)
  console.log('conv ok', t.includes('Terms &amp; Conditions') && !t.includes('Risk reversal'))
}

function patchHow() {
  const p = path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid')
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    "assign refund_url = section.settings.refund_url | default: '/pages/refund-policy'",
    "assign terms_url = section.settings.terms_url | default: 'https://app.lurvox.in/terms'"
  )
  t = t.replace(
    '<p><strong>Plan late?</strong> Full refund path</p>',
    '<p><strong>Terms</strong> apply to every plan</p>'
  )
  t = t.replace(
    /<div class="lx-how__risk">[\s\S]*?<\/div>/,
    `<div class="lx-how__risk">
      <p>
        Refunds and guarantees (if any) are only as stated in our
        <a href="{{ terms_url }}" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>.
      </p>
    </div>`
  )
  fs.writeFileSync(p, t)
  console.log('how ok', t.includes('Terms &amp; Conditions') && !t.includes('Risk reversal'))
}

patchCloser()
patchConv()
patchHow()
