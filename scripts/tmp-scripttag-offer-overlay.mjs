/**
 * Brief password toggle to flush storefront page_cache, then restore.
 * Also creates/updates a ScriptTag overlay for offer strip + timers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
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

async function putAsset(themeId, key, value) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.asset
}

const overlayJs = `/*! lurvox-offer-overlay */
(function () {
  if (window.__lurvoxOfferOverlay) return;
  window.__lurvoxOfferOverlay = true;
  if (!/lurvox\\.in|myshopify\\.com/i.test(location.host)) return;

  var STYLE_ID = 'lurvox-offer-overlay-css';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.lurvox-client-login,.aside.lurvox-client-login{display:none!important}',
      '#lurvox-offer-strip-live{position:relative;z-index:40;width:100%;overflow:hidden;color:#fff;',
      'background:radial-gradient(circle at 18% -80%,rgba(255,98,0,.46),transparent 52%),linear-gradient(105deg,#100b08 0%,#17100c 50%,#090909 100%);',
      'border-bottom:1px solid rgba(255,98,0,.38)}',
      '#lurvox-offer-strip-live a{display:flex;align-items:center;justify-content:center;gap:12px;min-height:48px;max-width:1200px;margin:0 auto;padding:7px 20px;color:inherit;text-decoration:none;flex-wrap:wrap}',
      '#lurvox-offer-strip-live .eyebrow{color:rgba(255,255,255,.62);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}',
      '#lurvox-offer-strip-live .offer{font-size:13px;font-weight:750}',
      '#lurvox-offer-strip-live .pill{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border:1px dashed rgba(255,98,0,.7);border-radius:999px;background:rgba(255,98,0,.12);white-space:nowrap}',
      '#lurvox-offer-strip-live .pill span{color:rgba(255,255,255,.58);font-size:9px;font-weight:800;letter-spacing:.12em}',
      '#lurvox-offer-strip-live .pill strong{color:#fff;font-size:12px;letter-spacing:.1em;font-variant-numeric:tabular-nums}',
      '#lurvox-offer-strip-live .cta{color:#ff6200;font-size:11px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}',
      '.lurvox-drawer-login-wrap{margin:16px 0 8px;padding:0 4px}',
      '.lurvox-drawer-login{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;text-decoration:none;color:#fff;background:linear-gradient(105deg,#17100c,#100b08);border:1px solid rgba(255,98,0,.45)}',
      '.lurvox-drawer-login strong{display:block;font-size:14px}',
      '.lurvox-drawer-login small{display:block;margin-top:2px;color:rgba(255,255,255,.58);font-size:11px}',
      '@media(max-width:749px){#lurvox-offer-strip-live .eyebrow,#lurvox-offer-strip-live .cta{display:none}#lurvox-offer-strip-live .offer{font-size:11px}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureOffer() {
    if (document.getElementById('lurvox-offer-strip-live')) return;
    if (!document.body) return;
    var el = document.createElement('aside');
    el.id = 'lurvox-offer-strip-live';
    el.setAttribute('aria-label', 'LIMITED OFFER');
    el.innerHTML =
      '<a href="/#plans">' +
      '<span class="eyebrow">LIMITED OFFER</span>' +
      '<span class="offer">5% OFF coaching plans</span>' +
      '<span class="pill"><span>CODE</span><strong>SAVE5</strong></span>' +
      '<span class="pill" data-sale-timer><span>SALE ENDS IN</span><strong>08:00:00</strong></span>' +
      '<span class="cta">View plans →</span>' +
      '</a>';
    var old = document.querySelector('.lurvox-client-login');
    if (old && old.parentNode) old.parentNode.insertBefore(el, old);
    else {
      var hg = document.querySelector('.shopify-section-group-header-group');
      if (hg) hg.insertBefore(el, hg.firstChild);
      else document.body.insertBefore(el, document.body.firstChild);
    }
    loopTimer(el.querySelector('[data-sale-timer] strong'), 'lurvox-sale-countdown-v1', 8, 5);
  }

  function loopTimer(valueEl, key, startH, floorH) {
    if (!valueEl) return;
    var startMs = startH * 3600000;
    var floorMs = floorH * 3600000;
    var endTime = 0;
    try {
      var stored = localStorage.getItem(key);
      var parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > Date.now()) endTime = parsed;
    } catch (e) {}
    if (!endTime) {
      endTime = Date.now() + startMs;
      try { localStorage.setItem(key, String(endTime)); } catch (e) {}
    }
    function tick() {
      var d = endTime - Date.now();
      if (d <= floorMs) {
        endTime = Date.now() + startMs;
        try { localStorage.setItem(key, String(endTime)); } catch (e) {}
        d = startMs;
      }
      var h = Math.floor(d / 3600000);
      var m = Math.floor((d % 3600000) / 60000);
      var s = Math.floor((d % 60000) / 1000);
      valueEl.textContent =
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  function fixPlanTimer() {
    var rows = document.querySelectorAll('[class*="lurvox-heading-timer"], [class*="ai-transformation-plan-countdown"]');
    rows.forEach(function (el) {
      if (el.dataset.priceWired === '1') return;
      el.dataset.priceWired = '1';
      if (!/price increases/i.test(el.textContent || '')) {
        var label = document.createElement('span');
        label.textContent = 'Price increases in ';
        el.insertBefore(label, el.firstChild);
      }
      var valueEl = el.querySelector('[data-lurvox-countdown-value], strong, span:last-child');
      if (!valueEl) {
        valueEl = document.createElement('strong');
        valueEl.textContent = '10:00:00';
        el.appendChild(valueEl);
      }
      el.setAttribute('data-countdown-start', '10');
      el.setAttribute('data-countdown-floor', '5');
      loopTimer(valueEl, 'lurvox-price-increase-countdown-v1', 10, 5);
    });
  }

  function injectDrawerLogin() {
    if (document.querySelector('.lurvox-drawer-login')) return;
    var targets = document.querySelectorAll(
      'header-drawer .menu-drawer__navigation, .menu-drawer__navigation, #menu-drawer nav, .menu-drawer__menu'
    );
    if (!targets.length) return;
    targets.forEach(function (nav) {
      if (nav.querySelector('.lurvox-drawer-login')) return;
      var wrap = document.createElement('div');
      wrap.className = 'lurvox-drawer-login-wrap';
      wrap.innerHTML =
        '<a class="lurvox-drawer-login" href="https://app.lurvox.in/login">' +
        '<span><strong>Existing client login</strong><small>Already paid or returning client</small></span>' +
        '<span aria-hidden="true">→</span></a>';
      nav.insertBefore(wrap, nav.firstChild);
    });
  }

  function run() {
    ensureOffer();
    fixPlanTimer();
    injectDrawerLogin();
  }

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 500);
  setTimeout(run, 1500);
  setTimeout(run, 3000);
})();
`

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const mainNum = main.id.split('/').pop()
console.log('MAIN', main.name, mainNum)

const asset = await putAsset(mainNum, 'assets/lurvox-offer-overlay.js', overlayJs)
console.log('asset public_url', asset.public_url)

const src = asset.public_url || `https://www.lurvox.in/cdn/shop/t/21/assets/lurvox-offer-overlay.js?v=${Date.now()}`

// List existing script tags
const tags = await fetch(`${REST}/script_tags.json`, {
  headers: { 'X-Shopify-Access-Token': token },
}).then((r) => r.json())
console.log(
  'existing tags',
  (tags.script_tags || []).map((t) => ({ id: t.id, src: t.src }))
)

const existing = (tags.script_tags || []).find((t) =>
  /lurvox-offer-overlay/i.test(t.src || '')
)
if (existing) {
  const upd = await fetch(`${REST}/script_tags/${existing.id}.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      script_tag: { id: existing.id, src, event: 'onload', display_scope: 'online_store' },
    }),
  }).then((r) => r.json())
  console.log('updated script tag', upd.script_tag?.id, upd.script_tag?.src)
} else {
  const created = await fetch(`${REST}/script_tags.json`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      script_tag: { event: 'onload', src, display_scope: 'online_store' },
    }),
  }).then((r) => r.json())
  console.log('created script tag', created)
}

// Password flush dance
const before = await gql(`{ onlineStore { passwordProtection { enabled } } }`)
console.log('password before', before.onlineStore.passwordProtection)

try {
  // Try enable then disable if currently disabled
  if (!before.onlineStore.passwordProtection?.enabled) {
    const en = await gql(
      `mutation {
        onlineStorePasswordProtectionUpdate(enable: true, password: "lurvoxflush") {
          onlineStore { passwordProtection { enabled } }
          userErrors { message }
        }
      }`
    )
    console.log('enable', JSON.stringify(en))
    await new Promise((r) => setTimeout(r, 3000))
    const dis = await gql(
      `mutation {
        onlineStorePasswordProtectionUpdate(enable: false) {
          onlineStore { passwordProtection { enabled } }
          userErrors { message }
        }
      }`
    )
    console.log('disable', JSON.stringify(dis))
  }
} catch (e) {
  console.log('password toggle failed', e.message)
}

console.log('done — probe storefront for script tag + overlay')
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const html = await fetch(`https://www.lurvox.in/index?cb=${Date.now()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log(i, {
    hasScript: /lurvox-offer-overlay/.test(html),
    hasSave5: html.includes('SAVE5'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
  })
}
