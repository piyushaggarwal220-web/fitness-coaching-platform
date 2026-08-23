/**
 * Remove leftover #lurvox-offer-strip-live dark overlay CSS from theme JS assets.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function safeJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await safeJson(res)
  if (json?.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const cleanerOverlay = `/*! lurvox-offer-overlay v4 — beige WELCOME60 strip helper */
(function () {
  if (window.__lurvoxOfferOverlayV4) return;
  window.__lurvoxOfferOverlayV4 = true;
  if (!/lurvox\\.in|myshopify\\.com/i.test(location.host)) return;

  var STYLE_ID = 'lurvox-offer-overlay-css';
  var old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  // Force beige strip over any stale #lurvox-offer-strip-live rules
  if (!document.getElementById('lurvox-offer-beige-force')) {
    var style = document.createElement('style');
    style.id = 'lurvox-offer-beige-force';
    style.textContent = [
      '#lurvox-offer-strip-live,.lurvox-offer-strip{color:#1a1a1a!important;background:#e8d5c4!important;background-image:none!important;border-bottom:1px solid rgba(0,0,0,.06)!important}',
      '#lurvox-offer-strip-live a,.lurvox-offer-strip__inner{color:#1a1a1a!important;gap:8px!important;min-height:38px!important;padding:8px 14px!important}',
      '#lurvox-offer-strip-live .eyebrow,#lurvox-offer-strip-live .pill,#lurvox-offer-strip-live .cta{display:none!important}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanPlanTimers() {
    document.querySelectorAll('[class*="lurvox-heading-timer"]').forEach(function (el) {
      el.querySelectorAll('span').forEach(function (span) {
        var t = (span.textContent || '').trim();
        if (/^price increases in\\.?$/i.test(t)) span.remove();
      });
      delete el.dataset.priceWired;
    });
  }

  function run() { cleanPlanTimers(); }
  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 500);
  setTimeout(run, 1500);
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
  // Replace overlay asset
  await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      asset: { key: 'assets/lurvox-offer-overlay.js', value: cleanerOverlay },
    }),
  })

  // Scrub hide-1month if it still injects old #lurvox-offer-strip-live CSS
  const got = await safeJson(
    await fetch(
      `${REST}/themes/${themeId}/assets.json?asset[key]=assets/lurvox-hide-1month.js`,
      { headers: { 'X-Shopify-Access-Token': token } }
    )
  )
  let body = got?.asset?.value
  if (!body) {
    console.log('no hide js', themeId)
    continue
  }
  let next = body
  // Remove style block that targets #lurvox-offer-strip-live dark theme
  next = next.replace(
    /var STYLE_ID = 'lurvox-offer-overlay-css';[\s\S]*?\(document\.head[\s\S]*?appendChild\(style\);\s*\}/,
    '/* old overlay css removed */'
  )
  next = next.replace(
    /#lurvox-offer-strip-live\{[^`]*?\}/g,
    '/* removed live strip rule */'
  )
  // Append v4 force if not present
  if (!/lurvox-offer-beige-force|__lurvoxOfferOverlayV4/.test(next)) {
    next += '\n' + cleanerOverlay
  }
  if (next !== body) {
    await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        asset: { key: 'assets/lurvox-hide-1month.js', value: next },
      }),
    })
    console.log('scrubbed hide', themeId)
  } else {
    console.log('hide unchanged', themeId, { hasOld: /#lurvox-offer-strip-live/.test(body) })
  }
  await new Promise((r) => setTimeout(r, 600))
}

console.log('done')
