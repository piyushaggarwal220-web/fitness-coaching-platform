import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const liquid = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'blocks', 'ai_gen_block_361650c.liquid'),
  'utf8'
)
const index = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'templates', 'index.json'),
  'utf8'
)

async function put(themeId, key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', themeId, key)
}

async function get(themeId, key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  return j.asset?.value || ''
}

// Deploy tap-to-plan onto BOTH candidate themes
for (const themeId of ['161375289595', '161294057723']) {
  await put(themeId, 'blocks/ai_gen_block_361650c.liquid', liquid)

  // Merge plan settings carefully for old theme: keep its structure but disable CTA path
  let indexVal = await get(themeId, 'templates/index.json')
  if (!indexVal) continue
  const parsed = JSON.parse(indexVal)
  for (const sec of Object.values(parsed.sections || {})) {
    for (const blk of Object.values(sec.blocks || {})) {
      if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
        blk.settings.plan_1_enabled = false
        if (/ADD TO CART/i.test(blk.settings.cta_text || '')) {
          blk.settings.cta_text = 'CONTINUE'
        }
        if (/7 days|trial/i.test(blk.settings.subheadline || '')) {
          blk.settings.subheadline =
            'Pick 3 / 6 / 12 months. Same full coaching on every plan. Use WELCOME60 for 60% off.'
        }
      }
    }
  }
  // For New changes theme, use the prepared index
  if (themeId === '161375289595') {
    await put(themeId, 'templates/index.json', index)
  } else {
    await put(themeId, 'templates/index.json', JSON.stringify(parsed, null, 2))
  }
}

// Force republish New changes
const pub = await (
  await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      query: `mutation($id: ID!) {
        themePublish(id: $id) {
          theme { id name role }
          userErrors { message }
        }
      }`,
      variables: { id: 'gid://shopify/OnlineStoreTheme/161375289595' },
    }),
  })
).json()
console.log('publish', JSON.stringify(pub, null, 2))

// REST themes check
const rest = await (await fetch(`${API}/themes.json`, { headers: H })).json()
console.log(
  'REST roles',
  (rest.themes || []).map((t) => `${t.id} ${t.role} ${t.name}`).join('\n')
)

await new Promise((r) => setTimeout(r, 8000))

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://www.lurvox.in/?preview_theme_id=161375289595&cb=${Date.now()}`,
  `https://www.lurvox.in/?preview_theme_id=161294057723&cb=${Date.now()}`,
]

for (const url of urls) {
  const html = await (
    await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
  ).text()
  console.log(
    JSON.stringify({
      url: url.replace(/cb=\d+/, 'cb=…'),
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
      hasTap: html.includes('window.location.href = link'),
      hasCtaButton: /data-cta-button/.test(html),
      hasAddToCart: /ADD TO CART/i.test(html),
      prices: [...html.matchAll(/data-plan-price="([^"]+)"/g)].map((m) => m[1]).slice(0, 8),
      seats: html.includes('data-lurvox-seats-filled'),
    })
  )
}
