import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const live = themes.find((t) => t.role === 'main')

const index = JSON.parse(
  (
    await (
      await fetch(
        `${REST}/themes/${live.id}/assets.json?asset[key]=templates/index.json&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset.value
)

console.log('full order', index.order)
console.log('section 17845381649d72a415', JSON.stringify(index.sections['17845381649d72a415'], null, 2)?.slice(0, 500))
console.log('home_blocks_v2 type', index.sections.home_blocks_v2?.type)
console.log('lurvox_hide', index.sections.lurvox_hide_1month)

// Put hide snippet INTO an existing rendered section file if it's a custom liquid section
const existingId = '17845381649d72a415'
const existing = index.sections[existingId]
console.log('existing section full', JSON.stringify(existing, null, 2).slice(0, 1000))

// Try injecting into header-group or footer-group which ARE rendering
for (const key of [
  'sections/header-group.json',
  'sections/footer-group.json',
  'sections/mobile-floating-bar.liquid',
]) {
  try {
    const asset = await (
      await fetch(
        `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
    const val = asset.asset?.value || ''
    console.log(key, 'bytes', val.length, 'updated', asset.asset?.updated_at)
    if (key.endsWith('.json')) {
      const data = JSON.parse(val)
      console.log('  types', Object.fromEntries(Object.entries(data.sections || {}).map(([id, s]) => [id, s.type])))
    } else {
      console.log('  has hide?', val.includes('lurvox-hide'))
      console.log('  head', val.slice(0, 120).replace(/\s+/g, ' '))
    }
  } catch (e) {
    console.log(key, e.message)
  }
}

// Can we update header-group.json to include our section?
const hg = JSON.parse(
  (
    await (
      await fetch(
        `${REST}/themes/${live.id}/assets.json?asset[key]=sections/header-group.json&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset.value
)

const hideId = 'lurvox_hide_1month'
hg.sections = hg.sections || {}
hg.order = hg.order || Object.keys(hg.sections)
hg.sections[hideId] = { type: 'lurvox-hide-1month', settings: {} }
if (!hg.order.includes(hideId)) hg.order.push(hideId)

const put = await fetch(`${REST}/themes/${live.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: { key: 'sections/header-group.json', value: JSON.stringify(hg, null, 2) },
  }),
})
const putJson = await put.json()
console.log('header-group put', put.status, putJson.asset?.updated_at)

const hg2 = JSON.parse(
  (
    await (
      await fetch(
        `${REST}/themes/${live.id}/assets.json?asset[key]=sections/header-group.json&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset.value
)
console.log('header-group has hide', !!hg2.sections?.[hideId], hg2.order?.slice(-5))

// Verify on storefront after short wait
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const home = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const ids = [...home.matchAll(/id="shopify-section-([^"]+)"/g)].map((m) => m[1])
  const hit = home.includes('lurvox-hide-1month-style') || home.includes('data-lurvox-hide-1month')
  console.log(i, { hit, ids })
  if (hit) {
    console.log('SUCCESS — hide section is on homepage')
    break
  }
}
