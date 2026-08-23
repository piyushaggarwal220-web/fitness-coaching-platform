import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }
const MAIN = '161112981755'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${MAIN}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

const layout = await getAsset('layout/theme.liquid')
fs.writeFileSync('C:/Users/DELL/coaching-platform/scripts/tmp-main-layout.liquid', layout)
console.log('layout bytes', layout.length)
console.log('markers:', JSON.stringify({
  talkHighlight: layout.includes('lurvox-talk-cta-highlight'),
  talkMobileFix: layout.includes('lurvox-mobile-talk-cta-v1'),
  talkPulse: layout.includes('lurvox-talk-cta-pulse'),
  labelClass: layout.includes('lurvox-talk-cta__label'),
}))

// Count liquid comment opens/closes to detect swallowing
const opens = (layout.match(/\{%-?\s*comment\s*-?%\}/g) || []).length
const closes = (layout.match(/\{%-?\s*endcomment\s*-?%\}/g) || []).length
console.log('liquid comment opens =', opens, 'closes =', closes)

const firstComment = layout.search(/\{%-?\s*comment\s*-?%\}/)
console.log('\n--- layout from first comment tag onward (900 chars) ---')
console.log(layout.slice(firstComment, firstComment + 900))

const block = await getAsset('blocks/ai_gen_block_361650c.liquid')
console.log('\nblock 361650c bytes', block?.length)
console.log('block markers:', JSON.stringify({
  equalShine: block?.includes('lurvox-equal-plan-shine'),
  hideRadios: block?.includes('lurvox-hide-plan-radios-v1'),
  mobilePlanCards: block?.includes('lurvox-mobile-plan-cards-v1'),
}))
