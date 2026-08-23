import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = 161086767355

async function get(key) {
  const j = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  return j.asset?.value ?? ''
}

const carouselKeys = [
  'blocks/ai_gen_block_3cbb200.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/_carousel-content.liquid',
]

for (const key of carouselKeys) {
  const v = await get(key)
  if (!v) {
    console.log(key, 'MISSING')
    continue
  }
  const markers = {
    startAutoplay: v.includes('startAutoplay'),
    stopAutoplay: v.includes('stopAutoplay') || v.includes('lurvox-no-autoplay') || v.includes('AUTO_PLAY = false'),
    interval: /setInterval\s*\(/.test(v) && /autoplay|slide|next/i.test(v),
    disabledComment: /autoplay disabled|no autoplay|autoplay stopped/i.test(v),
  }
  // Find how autoplay is gated
  const snippets = []
  for (const needle of ['startAutoplay', 'autoplay', 'setInterval', 'AUTO_PLAY', 'lurvox']) {
    let from = 0
    let n = 0
    while (n < 2) {
      const at = v.toLowerCase().indexOf(needle.toLowerCase(), from)
      if (at < 0) break
      snippets.push(v.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' '))
      from = at + needle.length
      n += 1
    }
  }
  console.log('\n==', key, 'len', v.length, markers)
  for (const s of snippets.slice(0, 6)) console.log(' ', s)
}

// Cache bust settings_data
const raw = await get('config/settings_data.json')
const settings = JSON.parse(raw.replace(/^\/\*[\s\S]*?\*\//, ''))
const current = settings.current
if (!current || typeof current !== 'object') throw new Error('bad settings_data')
current.lurvox_cache_bust = Date.now()
const put = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'config/settings_data.json', value: JSON.stringify(settings, null, 2) },
  }),
})
console.log('\ncache bust write', put.status)

// Also touch layout marker comment if present
const layout = await get('layout/theme.liquid')
const bumped = layout.includes('lurvox-cache-bust')
  ? layout.replace(/lurvox-cache-bust:\s*\d+/, `lurvox-cache-bust: ${Date.now()}`)
  : layout.replace(
      'lurvox-talk-cta-highlight',
      `lurvox-talk-cta-highlight\n  {%- comment -%} lurvox-cache-bust: ${Date.now()} {%- endcomment -%}`
    )
await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: bumped } }),
})
console.log('layout cache bump done')
