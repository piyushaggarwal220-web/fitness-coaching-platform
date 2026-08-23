import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const themes = (await fetch(`${REST}/themes.json`, { headers }).then((r) => r.json())).themes

const get = async (themeId, key) => {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) return null
  const json = await res.json()
  return json.asset?.value ?? null
}

for (const theme of themes) {
  const fab = await get(theme.id, 'sections/mobile-floating-bar.liquid')
  const idx = await get(theme.id, 'templates/index.json')
  const layout = await get(theme.id, 'layout/theme.liquid')
  console.log(
    [
      theme.id,
      theme.role.padEnd(11),
      (theme.name || '').slice(0, 34).padEnd(35),
      'fabTalk=' + (fab ? fab.includes('Talk To A Coach') : 'n/a'),
      'fabBook=' + (fab ? fab.includes('Book Consultation') : 'n/a'),
      'deadAnchor=' + (idx ? idx.includes('#shopify-section-blocks_C9E4qf') : 'n/a'),
      'newLabel=' + (idx ? idx.includes('GET THE 12-MONTH PLAN') : 'n/a'),
      'talkCss=' + (layout ? layout.includes('lurvox-talk-cta-highlight') : 'n/a'),
    ].join('  ')
  )
}
