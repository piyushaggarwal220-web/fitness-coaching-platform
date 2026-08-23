import fs from 'node:fs'

const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

const MARKERS = {
  talk: 'lurvox-mobile-talk-cta-v1',
  planCards: 'lurvox-mobile-plan-cards-v1',
  clientResults: 'lurvox-mobile-client-results-v1',
  gallery: 'lurvox-mobile-fitness-gallery-v1',
  hideRadios: 'lurvox-hide-plan-radios-v1',
  equalShine: 'lurvox-equal-plan-shine',
}

const targets = [
  ['normal', 'https://www.lurvox.in/?a=' + Date.now()],
  ['preview-main', 'https://www.lurvox.in/?preview_theme_id=161112981755&a=' + Date.now()],
  ['preview-salefocus', 'https://www.lurvox.in/?preview_theme_id=161086767355&a=' + Date.now()],
]

for (const [label, url] of targets) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' })
  const html = await res.text()
  const found = {}
  for (const [k, v] of Object.entries(MARKERS)) found[k] = html.includes(v)
  let sTheme = null
  const m = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
  if (m) {
    try {
      sTheme = JSON.parse(m[1]).id
    } catch {}
  }
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      bytes: html.length,
      shopifyThemeId: sTheme,
      renderTheme: (res.headers.get('server-timing') || '').match(/theme;desc="(\d+)"/)?.[1],
      blockIdSample: (html.match(/ai-transformation-plan-card-inner-([a-z0-9]+)/) || [])[1],
      ...found,
    })
  )
}
