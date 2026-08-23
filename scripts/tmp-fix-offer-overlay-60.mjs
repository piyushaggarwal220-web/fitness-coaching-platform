/**
 * Update lurvox-offer-overlay.js:
 * - stop injecting "Price increases in"
 * - remove leftover injected labels
 * - do not inject old SAVE5 strip when native 60% OFF strip exists
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const overlayJs = `/*! lurvox-offer-overlay v3 — 60% OFF / SALE ENDS IN only */
(function () {
  if (window.__lurvoxOfferOverlayV3) return;
  window.__lurvoxOfferOverlayV3 = true;
  if (!/lurvox\\.in|myshopify\\.com/i.test(location.host)) return;

  function cleanPlanTimers() {
    document.querySelectorAll('[class*="lurvox-heading-timer"], [class*="ai-transformation-plan-countdown"]').forEach(function (el) {
      el.querySelectorAll('span').forEach(function (span) {
        var t = (span.textContent || '').trim();
        if (/^price increases in\\.?$/i.test(t)) span.remove();
      });
      delete el.dataset.priceWired;
    });
  }

  function hideLegacyOverlayStrip() {
    var legacy = document.getElementById('lurvox-offer-strip-live');
    if (!legacy) return;
    var native = document.getElementById('lurvox-offer-strip-home') || document.querySelector('.lurvox-offer-strip--home');
    if (native || /SAVE5|5% OFF/i.test(legacy.textContent || '')) {
      legacy.remove();
    }
  }

  function run() {
    cleanPlanTimers();
    hideLegacyOverlayStrip();
  }

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 400);
  setTimeout(run, 1200);
  setTimeout(run, 2500);
})();
`

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const targets = themes.themes.nodes.filter((theme) => {
  const id = theme.id.split('/').pop()
  return (
    theme.role === 'MAIN' ||
    ['161389281531', '161390362875', '161391804667', '161375289595'].includes(id)
  )
})

for (const theme of targets) {
  const themeId = theme.id.split('/').pop()
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      asset: { key: 'assets/lurvox-offer-overlay.js', value: overlayJs },
    }),
  })
  const j = await r.json()
  if (j.errors) console.log('asset err', themeId, j.errors)
  else console.log('asset ok', themeId, j.asset?.public_url?.slice(0, 90))
}

const main = targets.find((t) => t.role === 'MAIN')
const mainAsset = await fetch(
  `${REST}/themes/${main.id.split('/').pop()}/assets.json?asset[key]=assets/lurvox-offer-overlay.js`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())
const src =
  mainAsset.asset?.public_url ||
  `https://www.lurvox.in/cdn/shop/t/21/assets/lurvox-offer-overlay.js?v=${Date.now()}`

const tags = await fetch(`${REST}/script_tags.json`, {
  headers: { 'X-Shopify-Access-Token': token },
}).then((r) => r.json())
const existing = (tags.script_tags || []).find((t) =>
  /lurvox-offer-overlay/i.test(t.src || '')
)
if (existing) {
  const upd = await fetch(`${REST}/script_tags/${existing.id}.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      script_tag: {
        id: existing.id,
        src,
        event: 'onload',
        display_scope: 'online_store',
      },
    }),
  }).then((r) => r.json())
  console.log('script tag updated', upd.script_tag?.id)
} else {
  console.log('no existing overlay script tag — theme asset updated only')
}

// Also scrub if overlay was appended into hide-1month JS
for (const theme of targets) {
  const themeId = theme.id.split('/').pop()
  for (const key of [
    'assets/lurvox-hide-1month.js',
    'assets/lurvox-tap-plan-force.js',
  ]) {
    const got = await fetch(
      `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    ).then((r) => r.json())
    const body = got.asset?.value
    if (!body || !/Price increases in/i.test(body)) continue
    const cleaned = body
      .replace(/label\.textContent\s*=\s*'Price increases in ';/g, "/* removed */")
      .replace(/label\.textContent\s*=\s*"Price increases in ";/g, '/* removed */')
    if (cleaned === body) {
      console.log('contains phrase but no exact assign', themeId, key)
      continue
    }
    await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ asset: { key, value: cleaned } }),
    })
    console.log('scrubbed', themeId, key)
  }
}

console.log('done')
