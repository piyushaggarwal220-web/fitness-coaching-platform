import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-live-home-autoplay-check.html',
  'utf8'
)

const fitnessRe =
  /class FitnessGallery[\s\S]*?customElements\.define\('fitness-gallery[^']+',[\s\S]*?\}\)\(\);/g
const fitness = [...html.matchAll(fitnessRe)]
console.log('fitness scripts', fitness.length)
for (const m of fitness) {
  const s = m[0]
  console.log({
    len: s.length,
    setupAutoplay: s.includes('setupAutoplay'),
    totalSlidesLine: (s.match(/this\.totalSlides[^\n]+/) || [])[0],
    dynamic: s.includes("querySelectorAll('[data-slide]')"),
  })
}

console.log({
  slides: (html.match(/ai-fitness-gallery__slide-/g) || []).length,
  thumbs: (html.match(/data-thumb=/g) || []).length,
  dataSlide: (html.match(/data-slide="/g) || []).length,
})

const member = html.match(
  /class MemberWinsCarousel[\s\S]*?customElements\.define\('member-wins[^']+',[\s\S]*?\}\)\(\);/
)
console.log('member', {
  found: !!member,
  setupAutoplay: member?.[0].includes('setupAutoplay'),
  len: member?.[0].length,
})

const clients = [
  ...html.matchAll(
    /class ClientResults[\s\S]*?customElements\.define\('client-results[^']+',[\s\S]*?\}\)\(\);/g
  ),
]
console.log(
  'clients',
  clients.map((m) => ({
    setupAutoplay: m[0].includes('setupAutoplay'),
    navigate: m[0].includes('navigate('),
    len: m[0].length,
  }))
)

// Compare unique marker from theme asset
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const asset = await fetch(
  `${REST}/themes/161086767355/assets.json?asset[key]=blocks/ai_gen_block_52353f6.liquid`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

const val = asset.asset.value
const marker = 'this._autoplayMs = 3500'
console.log('asset has marker', val.includes(marker))
console.log('asset totalSlides line', (val.match(/this\.totalSlides[^\n]+/) || [])[0])

// Does rendered HTML include a unique CSS string from the expanded thumbs?
console.log('html scrollable thumbs css', html.includes('max-width: calc(100% - 100px)'))
console.log('asset scrollable thumbs css', val.includes('max-width: calc(100% - 100px)'))

// Check Liquid comment uniqueness from autoplay patch
console.log('html scheduleResumeAutoplay', html.includes('scheduleResumeAutoplay'))
console.log('asset scheduleResumeAutoplay', val.includes('scheduleResumeAutoplay'))
