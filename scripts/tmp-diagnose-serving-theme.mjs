/**
 * Decide what the storefront ACTUALLY renders vs what admin says is main.
 * Checks content fingerprints (not just Shopify.theme id) with retries.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

const MARKERS = {
  talkHighlight: 'lurvox-talk-cta-highlight',
  talkMobileFix: 'lurvox-mobile-talk-cta-v1',
  hideRadios: 'lurvox-hide-plan-radios-v1',
  equalShine: 'lurvox-equal-plan-shine',
  mobileClientResults: 'lurvox-mobile-client-results-v1',
  mobilePlanCards: 'lurvox-mobile-plan-cards-v1',
  mobileGallery: 'lurvox-mobile-fitness-gallery-v1',
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

console.log('=== ADMIN ===')
console.log('main:', main.id, main.name)

// What does the main theme's layout actually contain?
const mainLayout = await getAsset(main.id, 'layout/theme.liquid')
console.log(
  'main layout markers:',
  JSON.stringify({
    talkHighlight: mainLayout?.includes(MARKERS.talkHighlight),
    talkMobileFix: mainLayout?.includes(MARKERS.talkMobileFix),
    bytes: mainLayout?.length,
  })
)

console.log('\n=== STOREFRONT (retries) ===')
for (let attempt = 1; attempt <= 6; attempt += 1) {
  const res = await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, {
    headers: UA,
    redirect: 'follow',
  })
  const html = await res.text()
  let servedThemeId = null
  const m = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
  if (m) {
    try {
      servedThemeId = JSON.parse(m[1]).id
    } catch {}
  }
  const found = {}
  for (const [k, v] of Object.entries(MARKERS)) found[k] = html.includes(v)

  console.log(
    JSON.stringify({
      attempt,
      status: res.status,
      servedThemeId,
      matchesAdminMain: servedThemeId === main.id,
      cdnFolder: (html.match(/\/cdn\/shop\/t\/(\d+)\//) || [])[1] || null,
      found,
    })
  )

  if (servedThemeId === main.id && found.talkMobileFix) {
    console.log('OK: storefront now serving admin main with mobile fixes')
    break
  }
  await new Promise((r) => setTimeout(r, 5000))
}

console.log('\n=== PER-THEME FINGERPRINT (layout/theme.liquid) ===')
for (const t of themes) {
  const layout = await getAsset(t.id, 'layout/theme.liquid')
  if (!layout) {
    console.log(String(t.id).padEnd(14), t.role.padEnd(11), (t.name || '').slice(0, 34), 'NO_LAYOUT')
    continue
  }
  console.log(
    String(t.id).padEnd(14),
    t.role.padEnd(11),
    (t.name || '').slice(0, 34).padEnd(35),
    'bytes=' + String(layout.length).padEnd(7),
    'talkFix=' + layout.includes(MARKERS.talkMobileFix)
  )
}
