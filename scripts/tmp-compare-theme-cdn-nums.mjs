const urls = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/?view=',
]

for (const u of urls) {
  const html = await fetch(u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text())
  const themeNums = [...new Set([...html.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1]))]
  const fp = html.match(/floating-panel\.js\?v=[0-9]+/)?.[0]
  const styles = html.match(/compiled_assets\/styles\.css\?v=[0-9]+/)?.[0]
  console.log(u, { themeNums, fp, styles })
}

// Compare asset from admin public_url if any
import fs from 'node:fs'
import path from 'node:path'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
const asset = (
  await (
    await fetch(
      `${REST}/themes/${main.id}/assets.json?asset[key]=assets/floating-panel.js&t=${Date.now()}`,
      { headers }
    )
  ).json()
).asset
console.log('admin asset', {
  public_url: asset.public_url,
  size: asset.size,
  updated_at: asset.updated_at,
  hasMarker: asset.value?.includes('lurvox-hide-1month-asset-v1'),
  valueLen: asset.value?.length,
})

if (asset.public_url) {
  const body = await fetch(asset.public_url + (asset.public_url.includes('?') ? '&' : '?') + 'r=' + Date.now()).then(
    (r) => r.text()
  )
  console.log('public_url fetch', { len: body.length, hasMarker: body.includes('lurvox-hide-1month-asset-v1') })
}

// List themes and their t/ mapping somehow via preview
const preview = await fetch(
  `https://www.lurvox.in/?preview_theme_id=${main.id}&cb=${Date.now()}`,
  { headers: { 'User-Agent': 'Mozilla/5.0' } }
).then((r) => r.text())
console.log('preview theme nums', [
  ...new Set([...preview.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1])),
])
console.log(
  'preview floating',
  preview.match(/floating-panel\.js\?v=[0-9]+/)?.[0],
  'hide',
  preview.includes('lurvox-hide-1month')
)
