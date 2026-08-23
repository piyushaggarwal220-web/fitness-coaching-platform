/**
 * Force Shopify storefront to serve current plan prices (no 1-month / ₹499).
 * Theme settings already correct; default URLs are stuck on CDN HTML.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await res.json()
  return json.asset?.value ?? null
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  return { status: res.status, ok: res.ok, slice: text.slice(0, 200) }
}

function applyPlanSettings(settings) {
  settings.plan_1_enabled = false
  settings.plan_1_duration = `ZZ_GONE_${Date.now()}`
  settings.plan_1_price = '499'
  settings.plan_1_monthly = 'HIDDEN'
  settings.plan_1_link = `${APP}/checkout?plan=3_months`

  settings.plan_2_enabled = true
  settings.plan_2_duration = '3 Months'
  settings.plan_2_price = '999'
  settings.plan_2_original_price = '1497'
  settings.plan_2_savings = 'SAVE Rs 498'
  settings.plan_2_monthly = '≈ Rs 333/month'
  settings.plan_2_link = `${APP}/checkout?plan=3_months`

  settings.plan_3_enabled = true
  settings.plan_3_duration = '6 Months'
  settings.plan_3_price = '1699'
  settings.plan_3_original_price = '2994'
  settings.plan_3_savings = 'SAVE Rs 1,295'
  settings.plan_3_monthly = '≈ Rs 283/month'
  settings.plan_3_link = `${APP}/checkout?plan=6_months`

  settings.plan_4_enabled = true
  settings.plan_4_duration = '12 Months'
  settings.plan_4_price = '2999'
  settings.plan_4_original_price = '5988'
  settings.plan_4_savings = 'SAVE Rs 2,989'
  settings.plan_4_monthly = '≈ Rs 250/month'
  settings.plan_4_link = `${APP}/checkout?plan=12_months`

  settings.lurvox_price_stamp = String(Date.now())
}

function patchIndex(index) {
  let found = 0
  for (const section of Object.values(index.sections || {})) {
    for (const block of Object.values(section.blocks || {})) {
      if (block?.settings && ('plan_2_price' in block.settings || block.type?.includes('361650c'))) {
        applyPlanSettings(block.settings)
        found++
      }
    }
    if (section?.settings && 'plan_2_price' in section.settings) {
      applyPlanSettings(section.settings)
      found++
    }
  }

  // Ensure hide-1month custom liquid block is present in home_blocks_v2 if section exists
  const home = index.sections?.home_blocks_v2
  if (home) {
    home.blocks = home.blocks || {}
    if (!home.blocks.lurvox_hide_1month_block) {
      home.blocks.lurvox_hide_1month_block = {
        type: 'lurvox-hide-1month',
        settings: {},
      }
    }
    const order = home.block_order || Object.keys(home.blocks)
    if (!order.includes('lurvox_hide_1month_block')) {
      home.block_order = ['lurvox_hide_1month_block', ...order]
    }
  }

  index.lurvox_price_bust = Date.now()
  return found
}

const PLANS_BODY = `<!-- lurvox-plans-no-1month:${Date.now()} -->
<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h1>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month. Secure checkout opens on the LURVOX app.</p>

  <h2 style="margin:28px 0 10px;font-size:18px;">Everything included</h2>
  <ul style="margin:0 0 24px;padding-left:18px;color:#333;">
    <li>Personal workout plan (gym, home, or both)</li>
    <li>Personal diet plan (veg / non-veg / allergies supported)</li>
    <li>Weekly coach check-ins with plan updates</li>
    <li>Daily habit &amp; health trackers</li>
    <li>Direct coach chat support</li>
  </ul>

  <h2 style="margin:28px 0 12px;font-size:18px;">Plans</h2>
  <div style="display:grid;gap:14px;">
    <a href="${APP}/checkout?plan=3_months" style="display:block;padding:16px;border:1px solid #e5e5e5;border-radius:12px;text-decoration:none;color:inherit;">
      <div style="font-weight:700;">3 Months — ₹999</div>
      <div style="color:#666;font-size:14px;">≈ ₹333/month · SAVE ₹498</div>
    </a>
    <a href="${APP}/checkout?plan=6_months" style="display:block;padding:16px;border:2px solid #ff6200;border-radius:12px;text-decoration:none;color:inherit;">
      <div style="font-weight:700;">6 Months — ₹1699 <span style="color:#ff6200;font-size:12px;">MOST POPULAR</span></div>
      <div style="color:#666;font-size:14px;">≈ ₹283/month · SAVE ₹1,295</div>
    </a>
    <a href="${APP}/checkout?plan=12_months" style="display:block;padding:16px;border:1px solid #e5e5e5;border-radius:12px;text-decoration:none;color:inherit;">
      <div style="font-weight:700;">12 Months — ₹2999</div>
      <div style="color:#666;font-size:14px;">≈ ₹250/month · SAVE ₹2,989 · Crazy League + ₹5,000 prize</div>
    </a>
  </div>
</div>`

const HIDE_LIQUID = `{%- comment -%} LURVOX hide retired 1-month plan {%- endcomment -%}
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"],
  .ai-transformation-plan-card[data-plan-index="1"],
  [class*="ai-transformation-plan-card-"][data-plan-index="1"] {
    display: none !important;
  }
</style>
<script>
(function () {
  function hide() {
    document.querySelectorAll('[data-plan-index="1"]').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('[class*="ai-transformation-plan-card-duration"]').forEach(function (el) {
      var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (/^1\\s*Month$/i.test(t) || /^1\\s*MONTH$/i.test(t)) {
        var card = el.closest('[class*="ai-transformation-plan-card-"]') || el.parentElement;
        while (card && card !== document.body) {
          var cls = card.className || '';
          if (/ai-transformation-plan-card-[a-z0-9]+$/i.test(String(cls).split(/\\s+/).find(Boolean) || '') ||
              /ai-transformation-plan-card/.test(cls)) {
            // climb to outermost card-ish node with duration child
          }
          if ((card.querySelector && card.querySelector('[class*="plan-card-price"]')) ||
              /plan-card(?!-)/.test(cls)) {
            card.style.setProperty('display', 'none', 'important');
            break;
          }
          card = card.parentElement;
        }
      }
    });
  }
  hide();
  document.addEventListener('DOMContentLoaded', hide);
  setTimeout(hide, 50);
  setTimeout(hide, 500);
})();
</script>
<div hidden data-lurvox-hide-1month="1"></div>
`

async function ensureHideFiles(themeId) {
  for (const key of ['sections/lurvox-hide-1month.liquid', 'blocks/lurvox-hide-1month.liquid']) {
    const existing = await getAsset(themeId, key)
    if (!existing || !existing.includes('lurvox-hide-1month-style')) {
      const schema =
        key.startsWith('sections/')
          ? `\n{% schema %}\n{\n  "name": "LURVOX hide 1-month",\n  "settings": [],\n  "presets": [{ "name": "LURVOX hide 1-month" }]\n}\n{% endschema %}\n`
          : `\n{% schema %}\n{\n  "name": "LURVOX hide 1-month",\n  "settings": []\n}\n{% endschema %}\n`
      console.log('put', key, await putAsset(themeId, key, HIDE_LIQUID + schema))
    } else {
      console.log(key, 'ok')
    }
  }
}

function extractPrices(html) {
  const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)].map((m) =>
    m[1].trim()
  )
  const prices = [...html.matchAll(/plan-card-price[^>]*>\s*([^<]+)/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  )
  const has499 = /Rs(?:&nbsp;|\s)*499|₹\s*499|(?<!\d)1 Month/i.test(html)
  const hasHide = html.includes('data-lurvox-hide-1month') || html.includes('lurvox-hide-1month-style')
  return { durations: durations.filter(Boolean), prices: prices.filter(Boolean), has499, hasHide }
}

// --- main ---
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

await ensureHideFiles(main.id)

const indexRaw = await getAsset(main.id, 'templates/index.json')
const index = JSON.parse(indexRaw)
const patched = patchIndex(index)
console.log('patched plan blocks', patched)
console.log('put index', await putAsset(main.id, 'templates/index.json', JSON.stringify(index, null, 2)))

// Touch settings_data for cache bust
try {
  const settingsRaw = await getAsset(main.id, 'config/settings_data.json')
  if (settingsRaw) {
    const cleaned = settingsRaw.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    const settings = JSON.parse(cleaned)
    settings.current = settings.current || {}
    settings.current.lurvox_cache_bust = Date.now()
    console.log(
      'put settings_data',
      await putAsset(main.id, 'config/settings_data.json', JSON.stringify(settings))
    )
  }
} catch (e) {
  console.log('settings_data skip', e.message)
}

// Fix coaching-plans page body + recreate/update plans handle
const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
const coaching = pages.find((p) => p.handle === 'coaching-plans')
if (coaching) {
  const put = await fetch(`${REST}/pages/${coaching.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: coaching.id, body_html: PLANS_BODY, published: true } }),
  })
  console.log('update coaching-plans', put.status)
}

let plansPage = pages.find((p) => p.handle === 'plans')
if (!plansPage) {
  // Create fresh plans page with correct body (CDN may still ghost old HTML until theme publish)
  const create = await fetch(`${REST}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      page: {
        title: 'PLANS',
        handle: 'plans',
        body_html: PLANS_BODY,
        published: true,
      },
    }),
  })
  const created = await create.json()
  console.log('create plans', create.status, created.page?.id, created.errors || '')
  plansPage = created.page
} else {
  const put = await fetch(`${REST}/pages/${plansPage.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: plansPage.id, body_html: PLANS_BODY, published: true } }),
  })
  console.log('update plans', put.status)
}

// Redirects: ensure /pages/plans -> coaching-plans as backup? Prefer serving correct plans page.
const redirects = (await (await fetch(`${REST}/redirects.json?limit=250`, { headers })).json())
  .redirects
const plansRedirects = redirects.filter(
  (r) => r.path === '/pages/plans' || r.target?.includes('/pages/plans')
)
console.log(
  'existing redirects',
  plansRedirects.map((r) => `${r.path} -> ${r.target}`)
)

// Duplicate + publish to bake Asset API into storefront
const dupName = `LURVOX Prices ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
const dup = await gql(
  `mutation themeDuplicate($id: ID!, $name: String) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${main.id}`, name: dupName }
)
console.log('duplicate', JSON.stringify(dup.themeDuplicate, null, 2))
if (dup.themeDuplicate.userErrors?.length) {
  throw new Error('duplicate failed')
}
const newThemeId = dup.themeDuplicate.newTheme.id.split('/').pop()

// Wait for assets
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  try {
    const idx = JSON.parse(await getAsset(newThemeId, 'templates/index.json'))
    const stamp = idx.lurvox_price_bust
    console.log('dup wait', i, 'stamp', stamp)
    if (stamp) break
  } catch (e) {
    console.log('dup wait', i, e.message)
  }
}

await ensureHideFiles(newThemeId)

const pub = await gql(
  `mutation themePublish($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${newThemeId}` }
)
console.log('publish', JSON.stringify(pub.themePublish, null, 2))

await fetch(`${REST}/themes/${newThemeId}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ theme: { id: Number(newThemeId), role: 'main' } }),
})

console.log('\nVerifying storefront...')
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const home = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  }).then((r) => r.text())
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const plans = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const h = extractPrices(home)
  const v = extractPrices(view)
  const plansHas1 = /1 Month\s*[—\-]\s*₹?499/i.test(plans)
  const plansStamp = plans.includes('lurvox-plans-no-1month')
  const cdnTheme = (home.match(/\/cdn\/shop\/t\/(\d+)\//) || [])[1]
  console.log(i, {
    cdnTheme,
    home: h,
    view: v,
    plansHas1,
    plansStamp,
  })
  // Success: no visible 1-month on home (either not in HTML or hide present), plans page updated
  const homeOk =
    (!h.durations.includes('1 Month') && !h.prices.some((p) => /499/.test(p))) ||
    (h.hasHide && !h.durations.includes('1 Month'))
  // With CSS hide, duration may still be in HTML - check visible via hide
  const homeOk2 = h.hasHide || (!/1 Month/.test(h.durations.join('|')) && !h.has499)
  if ((homeOk || homeOk2) && plansStamp && !plansHas1) {
    console.log('SUCCESS')
    break
  }
}

console.log('done. new main theme id', newThemeId)
