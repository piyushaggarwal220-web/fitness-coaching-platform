/**
 * Install a Shopify ScriptTag that works even if homepage HTML is frozen:
 * - hide plan CTA / add-to-cart button
 * - tapping a plan card goes to its data-plan-link
 */
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

const JS = `/*! lurvox-tap-plan v1 */
(function () {
  function hideCtas() {
    document.querySelectorAll('[data-cta-button]').forEach(function (el) {
      var wrap =
        el.closest('[class*="ai-transformation-plan-cta-wrapper"]') ||
        el.parentElement ||
        el;
      wrap.style.setProperty('display', 'none', 'important');
    });
    document
      .querySelectorAll('[class*="ai-transformation-plan-cta-wrapper"]')
      .forEach(function (el) {
        el.style.setProperty('display', 'none', 'important');
      });
  }

  function wireCards() {
    document
      .querySelectorAll('[class*="ai-transformation-plan-card-"][data-plan-link]')
      .forEach(function (card) {
        if (card.dataset.lurvoxTapWired === '1') return;
        card.dataset.lurvoxTapWired = '1';
        card.style.cursor = 'pointer';
        card.addEventListener(
          'click',
          function (e) {
            var link = card.getAttribute('data-plan-link');
            if (!link) return;
            e.preventDefault();
            e.stopPropagation();
            window.location.href = link;
          },
          true
        );
      });
  }

  function run() {
    hideCtas();
    wireCards();
  }

  run();
  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 300);
  setTimeout(run, 1200);
  try {
    new MutationObserver(run).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (e) {}
})();
`

// Host the script as a theme asset on MAIN, then create ScriptTag pointing to CDN URL
const themes = await (
  await fetch(`${API}/themes.json`, { headers: H })
).json()
const main = (themes.themes || []).find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('MAIN', main.id, main.name)

await fetch(`${API}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    asset: { key: 'assets/lurvox-tap-plan.js', value: JS },
  }),
})
console.log('uploaded assets/lurvox-tap-plan.js')

// Also put on the sticky old theme id
await fetch(`${API}/themes/161294057723/assets.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    asset: { key: 'assets/lurvox-tap-plan.js', value: JS },
  }),
})

// Resolve asset URL from storefront after a short wait — or use shopify CDN pattern via theme asset
const assetMeta = await (
  await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent('assets/lurvox-tap-plan.js')}`,
    { headers: H }
  )
).json()
const publicUrl = assetMeta.asset?.public_url
console.log('public_url', publicUrl)

if (!publicUrl) throw new Error('No public_url for tap-plan.js')

// List existing script tags
const existing = await (await fetch(`${API}/script_tags.json`, { headers: H })).json()
console.log(
  'existing script tags',
  (existing.script_tags || []).map((s) => ({ id: s.id, src: s.src }))
)

for (const tag of existing.script_tags || []) {
  if (/lurvox-tap-plan|lurvox-hide-1month/i.test(tag.src || '')) {
    await fetch(`${API}/script_tags/${tag.id}.json`, { method: 'DELETE', headers: H })
    console.log('deleted old tag', tag.id, tag.src)
  }
}

const created = await (
  await fetch(`${API}/script_tags.json`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      script_tag: {
        event: 'onload',
        src: publicUrl.includes('?')
          ? `${publicUrl}&v=${Date.now()}`
          : `${publicUrl}?v=${Date.now()}`,
        display_scope: 'online_store',
      },
    }),
  })
).json()
console.log('created', JSON.stringify(created, null, 2))

// Also inject via layout on main + sticky theme so it loads even without ScriptTag delay
for (const themeId of [String(main.id), '161294057723']) {
  const layoutRes = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
    { headers: H }
  )
  const layoutJson = await layoutRes.json()
  let layout = layoutJson.asset?.value
  if (!layout) continue
  layout = layout.replace(
    /\n?<script src="\{\{ 'lurvox-tap-plan.js' \| asset_url \}\}" defer><\/script>/g,
    ''
  )
  layout = layout.replace(
    '</head>',
    `  <script src="{{ 'lurvox-tap-plan.js' | asset_url }}" defer></script>\n</head>`
  )
  await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
  })
  console.log('layout injected', themeId)
}

// Verify script is reachable
const jsCheck = await fetch(publicUrl + `?check=${Date.now()}`)
console.log('js status', jsCheck.status, (await jsCheck.text()).slice(0, 80))

console.log(
  JSON.stringify({
    ok: true,
    mainTheme: main.id,
    scriptSrc: created.script_tag?.src || publicUrl,
    note: 'CTA hidden + tap-to-plan via ScriptTag/layout even if homepage HTML is cached',
  })
)
