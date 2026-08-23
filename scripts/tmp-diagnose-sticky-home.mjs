import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token }

const THEME = '161294057723'

// List assets mentioning cta-button or plan selector
const list = await (await fetch(`${API}/themes/${THEME}/assets.json`, { headers: H })).json()
const keys = (list.assets || []).map((a) => a.key)
const interesting = keys.filter((k) =>
  /361650c|plan|cta|transformation|index\.json|header-group|theme\.liquid|hide-1month/i.test(k)
)
console.log('interesting keys', interesting)

for (const key of [
  'blocks/ai_gen_block_361650c.liquid',
  'templates/index.json',
  'layout/theme.liquid',
  'sections/lurvox-hide-1month.liquid',
]) {
  const j = await (
    await fetch(
      `${API}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
      { headers: H }
    )
  ).json()
  const v = j.asset?.value || ''
  console.log(
    key,
    JSON.stringify({
      updated: j.asset?.updated_at,
      size: v.length,
      hasCta: v.includes('data-cta-button'),
      hasTap: v.includes('window.location.href = link') || v.includes('goToPlan'),
      stamp: v.match(/lurvox-cache-bust \d+/)?.[0] || null,
      planBlockTypes: [...v.matchAll(/ai_gen_block_[a-z0-9]+/g)].slice(0, 10),
    })
  )
}

// Find which section contains the plan block in index
const index = JSON.parse(
  (
    await (
      await fetch(
        `${API}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`,
        { headers: H }
      )
    ).json()
  ).asset.value
)
for (const [sid, sec] of Object.entries(index.sections || {})) {
  for (const [bid, blk] of Object.entries(sec.blocks || {})) {
    if (String(blk.type).includes('361650c') || /plan/i.test(blk.type)) {
      console.log('found block', sid, bid, blk.type, {
        cta: blk.settings?.cta_text,
        p2: blk.settings?.plan_2_price,
        p2link: blk.settings?.plan_2_link,
      })
    }
  }
  if (/plan|pricing|361650c/i.test(sec.type) || /plan|pricing/i.test(sid)) {
    console.log('section', sid, sec.type)
  }
}

// Also check if Shopify is serving from Online Store password / bot challenge
const res = await fetch(`https://www.lurvox.in/?diag=${Date.now()}`, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    Accept: 'text/html',
  },
})
const html = await res.text()
console.log('bot check', {
  status: res.status,
  len: html.length,
  hasChallenge: /challenge|captcha|bot/i.test(html.slice(0, 2000)),
  title: html.match(/<title>([^<]+)</)?.[1],
  themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
  // Find script src hashes that might indicate theme version
  themeAssets: [...html.matchAll(/cdn\.shopify\.com\/s\/files\/[^"]+\/(assets\/[^"?]+)/g)]
    .map((m) => m[1])
    .slice(0, 5),
})

// Save a snippet around CTA for inspection
const idx = html.indexOf('data-cta-button')
console.log('cta context', idx, html.slice(Math.max(0, idx - 80), idx + 120))
const idx2 = html.indexOf('ai-transformation-plan-cta')
console.log('cta class context', idx2, html.slice(Math.max(0, idx2 - 40), idx2 + 160))
