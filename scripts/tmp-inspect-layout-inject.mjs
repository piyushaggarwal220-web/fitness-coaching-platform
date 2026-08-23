import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const j = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())

const layout = j.asset.value
fs.writeFileSync(path.join(process.env.TEMP, 'draft-layout-before.liquid'), layout)

const markers = [
  ['lurvox-talk-inline', /{%-?\s*comment\s*-?%}\s*lurvox-talk[\s\S]*?{%-?\s*comment\s*-?%}\s*\/?lurvox-talk[\s\S]*?{%-?\s*endcomment\s*-?%}/gi],
]

// Find all talk-related inject blocks by comment markers
const commentBlocks = [...layout.matchAll(/{%-?\s*comment\s*-?%}([\s\S]*?){%-?\s*endcomment\s*-?%}/gi)]
console.log(
  'talk-ish comments',
  commentBlocks
    .map((m) => m[1].trim().slice(0, 80))
    .filter((t) => /talk|consult|wa\.me|coach/i.test(t))
)

const idx = layout.indexOf('lurvox-talk-coach__form')
console.log('form index', idx)
console.log(layout.slice(Math.max(0, idx - 800), idx + 200))
