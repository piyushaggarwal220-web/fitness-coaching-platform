import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

// Host a tiny JS file as a theme asset so ScriptTag can point at it,
// OR use an inline data URI / Shopify CDN asset.

const themeRes = await fetch(`${REST}/themes.json`, { headers: H })
const main = (await themeRes.json()).themes.find((t) => t.role === 'main')
console.log('theme', main.id, main.name)

const js = `/*! lurvox-stabilize-trial-v1 */
(function () {
  try {
    // Cancel the legacy hide/show fight: keep plan_1 trial visible, never toggle it.
    var css = document.createElement('style');
    css.id = 'lurvox-stabilize-trial';
    css.textContent = '[data-plan-index="1"][data-plan-price="179"],[data-plan-index="1"][data-plan-link*="trial"]{display:block!important;visibility:visible!important;}[data-plan-index="1"][data-plan-price="999"],[data-plan-index="1"][data-plan-price="499"]{display:none!important;}';
    document.documentElement.appendChild(css);

    function stabilize() {
      document.querySelectorAll('[data-plan-index="1"][data-plan-price="179"],[data-plan-index="1"][data-plan-link*="trial"]').forEach(function (el) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.removeAttribute('hidden');
        el.removeAttribute('aria-hidden');
      });
      document.querySelectorAll('[data-plan-index="1"][data-plan-price="999"],[data-plan-index="1"][data-plan-price="499"]').forEach(function (el) {
        el.style.setProperty('display', 'none', 'important');
      });
    }

    // Run immediately and once after DOM is ready — no repeating timers.
    stabilize();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', stabilize, { once: true });
    }
    // One deferred pass in case a late legacy script still runs.
    setTimeout(stabilize, 50);
    setTimeout(stabilize, 300);
  } catch (e) {}
})();
`

const assetKey = 'assets/lurvox-stabilize-trial.js'
const put = await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ asset: { key: assetKey, value: js } }),
})
const putJson = await put.json()
if (!put.ok || putJson.errors) throw new Error(JSON.stringify(putJson))
console.log('asset uploaded', putJson.asset?.public_url || putJson.asset?.key)

const publicUrl = putJson.asset?.public_url
if (!publicUrl) {
  // Fallback: construct CDN URL from shop
  console.log('no public_url on asset, listing script tags / using asset path')
}

// List existing script tags
const list = await fetch(`${REST}/script_tags.json`, { headers: H })
const listJson = await list.json()
console.log('existing script_tags', listJson.script_tags?.map((s) => ({ id: s.id, src: s.src, event: s.event })))

// Remove old lurvox stabilize tags
for (const s of listJson.script_tags || []) {
  if (/lurvox-stabilize-trial/.test(s.src || '')) {
    await fetch(`${REST}/script_tags/${s.id}.json`, { method: 'DELETE', headers: H })
    console.log('deleted old tag', s.id)
  }
}

const src = publicUrl || `https://cdn.shopify.com/s/files/1/0000/0000/t/${main.id}/assets/lurvox-stabilize-trial.js`
// Prefer the returned public_url
const create = await fetch(`${REST}/script_tags.json`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    script_tag: {
      event: 'onload',
      src: publicUrl,
      display_scope: 'online_store',
    },
  }),
})
const createJson = await create.json()
console.log('create status', create.status, JSON.stringify(createJson).slice(0, 500))
