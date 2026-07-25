/**
 * Bust the Shopify storefront theme cache by touching config/settings_data.json,
 * then poll the live homepage until the mobile-fix markers appear.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = process.argv[2] || '161112981755'

const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

const raw = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=config/settings_data.json&t=${Date.now()}`,
  { headers }
).then((r) => r.json())

const settings = JSON.parse(raw.asset.value)
if (!settings.current || typeof settings.current !== 'object') {
  throw new Error('unexpected settings_data shape')
}
settings.current.lurvox_cache_bust = Date.now()

const put = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'config/settings_data.json', value: JSON.stringify(settings, null, 2) },
  }),
})
console.log('theme', THEME, 'settings_data write:', put.status)

const MARKERS = {
  clientResults: 'lurvox-mobile-client-results-v1',
  planCards: 'lurvox-mobile-plan-cards-v1',
  gallery: 'lurvox-mobile-fitness-gallery-v1',
  talk: 'lurvox-mobile-talk-cta-v1',
  hideRadios: 'lurvox-hide-plan-radios-v1',
}

for (let i = 1; i <= 12; i += 1) {
  await new Promise((r) => setTimeout(r, 7000))
  const res = await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, {
    headers: UA,
    redirect: 'follow',
  })
  const html = await res.text()
  const found = {}
  for (const [k, v] of Object.entries(MARKERS)) found[k] = html.includes(v)
  const renderTheme = (res.headers.get('server-timing') || '').match(/theme;desc="(\d+)"/)?.[1]
  const compiled = html.match(/compiled_assets\/styles\.css\?v=(\d+)/)?.[1]
  const done = found.clientResults && found.planCards && found.gallery && found.talk

  console.log(
    JSON.stringify({
      attempt: i,
      bytes: html.length,
      renderTheme,
      compiledVersion: compiled?.slice(-10),
      ...found,
      done,
    })
  )
  if (done) {
    console.log('LIVE NOW HAS MOBILE FIXES')
    break
  }
}
