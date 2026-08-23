import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const KEYS = [
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
]

const out = []
for (const key of KEYS) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const value = (await res.json()).asset?.value ?? ''
  out.push({
    key,
    bytes: value.length,
    scriptCount: (value.match(/<script>/g) || []).length,
    hasDefine: value.includes('customElements.define'),
    markerV2: value.includes('lurvox-carousel-nav-restore-v2'),
    markerV1: value.includes('lurvox-carousel-nav-restore-v1'),
    hasAutoplay: value.includes('setupAutoplay'),
    hasScrollIntoView: value.includes('scrollIntoView'),
    hasWindowScroll: value.includes('window.scrollTo') || value.includes('window.scrollBy'),
  })
}
console.log(JSON.stringify(out, null, 2))
