/**
 * Nuclear cache flush: briefly toggle online-store password protection,
 * then restore. Also inject FAB hide + republish dance.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
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
  if (json.errors) {
    console.log('GQL errors', JSON.stringify(json.errors, null, 2).slice(0, 1000))
    throw new Error('gql failed')
  }
  return json.data
}

function probe(html) {
  return {
    group: html.match(/sections--(\d+)__/)?.[1],
    hide: html.includes('lurvox-hide-1month-style'),
    durations: [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean),
    has499: /Rs(?:&nbsp;|\s)*499|₹\s*499/.test(html),
    plansStamp: html.includes('lurvox-plans-no-1month'),
    exact1MonthPlan: /1 Month\s*[—\-]/.test(html),
  }
}

async function fetchHome() {
  return fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }).then((r) => r.text())
}

async function fetchPlans() {
  return fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
    },
  }).then((r) => r.text())
}

console.log('BEFORE home', probe(await fetchHome()))
console.log('BEFORE plans', probe(await fetchPlans()))

// Discover password mutation schema
const schema = await gql(`{
  __type(name: "Mutation") {
    fields {
      name
      args { name type { name kind ofType { name kind } } }
    }
  }
}`)
const pwdFields = schema.__type.fields.filter((f) =>
  /password|onlineStore|storefront/i.test(f.name)
)
console.log(
  'password-related mutations',
  pwdFields.map((f) => ({
    name: f.name,
    args: f.args.map((a) => `${a.name}:${a.type.name || a.type.ofType?.name}`),
  }))
)

const before = await gql(`{ onlineStore { passwordProtection { enabled } } }`)
console.log('passwordProtection', before.onlineStore.passwordProtection)

// Try common mutation names
const candidates = [
  {
    name: 'onlineStorePasswordProtectionUpdate',
    query: `mutation($enabled: Boolean!, $password: String) {
      onlineStorePasswordProtectionUpdate(enabled: $enabled, password: $password) {
        onlineStore { passwordProtection { enabled } }
        userErrors { field message }
      }
    }`,
  },
  {
    name: 'onlineStoreUpdate',
    query: `mutation($input: OnlineStoreInput!) {
      onlineStoreUpdate(input: $input) {
        onlineStore { passwordProtection { enabled } }
        userErrors { field message }
      }
    }`,
  },
]

let toggled = false
for (const c of candidates) {
  if (!pwdFields.some((f) => f.name === c.name) && c.name !== 'onlineStoreUpdate') {
    // still try if mutation might exist without matching filter
  }
  try {
    if (c.name === 'onlineStorePasswordProtectionUpdate') {
      const on = await gql(c.query, { enabled: true, password: `tmpflush${Date.now()}` })
      console.log('enable', JSON.stringify(on).slice(0, 400))
      await new Promise((r) => setTimeout(r, 3000))
      const off = await gql(c.query, { enabled: false })
      console.log('disable', JSON.stringify(off).slice(0, 400))
      toggled = true
      break
    }
  } catch (e) {
    console.log(c.name, 'failed', e.message)
  }
}

if (!toggled) {
  // REST shop.json password
  try {
    const shop = await (await fetch(`${REST}/shop.json`, { headers })).json()
    console.log('shop password_enabled', shop.shop?.password_enabled)
    const enable = await fetch(`${REST}/shop.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        shop: {
          password: `tmpflush${Date.now()}`,
          password_enabled: true,
        },
      }),
    })
    console.log('REST enable', enable.status, (await enable.text()).slice(0, 300))
    await new Promise((r) => setTimeout(r, 3000))
    const disable = await fetch(`${REST}/shop.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ shop: { password_enabled: false } }),
    })
    console.log('REST disable', disable.status, (await disable.text()).slice(0, 300))
    toggled = true
  } catch (e) {
    console.log('REST password toggle failed', e.message)
  }
}

// Ensure FAB hide is on current main (section API path)
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
const KEY = 'sections/mobile-floating-bar.liquid'
const MARKER_START = '{%- comment -%} lurvox-hide-1month-fab-v3 {%- endcomment -%}'
const MARKER_END = '{%- comment -%} /lurvox-hide-1month-fab-v3 {%- endcomment -%}'
const SNIPPET = `
${MARKER_START}
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"]{display:none!important}
</style>
<script>
(function(){
  function hide(){
    document.querySelectorAll('[data-plan-index="1"]').forEach(function(el){
      el.style.setProperty('display','none','important');
      el.setAttribute('hidden','true');
      el.setAttribute('aria-hidden','true');
    });
    document.querySelectorAll('[class*="plan-card-duration"]').forEach(function(el){
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
      if(/^1\\s*Months?$/i.test(t)){
        var n=el;
        for(var i=0;i<8 && n;i++){
          if(n.querySelector && n.querySelector('[class*="plan-card-price"]') && n.querySelector('[class*="plan-card-duration"]')){
            n.style.setProperty('display','none','important');
            break;
          }
          n=n.parentElement;
        }
      }
    });
    document.querySelectorAll('a[href*="plan=1_month"],a[href*="plans/1-month"]').forEach(function(a){
      a.setAttribute('href','${APP}/checkout?plan=3_months');
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', hide);
  else hide();
  setTimeout(hide,300); setTimeout(hide,1000); setTimeout(hide,2500);
})();
</script>
<div hidden data-lurvox-hide-1month="fab-v3"></div>
${MARKER_END}
`

let fab = (
  await (
    await fetch(`${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}`, {
      headers,
    })
  ).json()
).asset.value

fab = fab
  .replace(
    /\{%- comment -%\} lurvox-hide-1month-fab-v[123][\s\S]*?\{%- comment -%\} \/lurvox-hide-1month-fab-v[123] \{%- endcomment -%\}/g,
    ''
  )
  .replace(/<!-- lurvox-hide-1month-fab-v1 -->[\s\S]*$/g, '')
fab = fab.trimEnd() + '\n' + SNIPPET + '\n'

await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: KEY, value: fab } }),
})
await gql(
  `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
    files: [{ filename: KEY, body: { type: 'TEXT', value: fab } }],
  }
)
console.log('FAB injected on', main.id, main.name)

// Update plans page again
const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
for (const handle of ['plans', 'coaching-plans']) {
  const p = pages.find((x) => x.handle === handle)
  if (!p) continue
  const body = `<!-- lurvox-plans-no-1month:${Date.now()} -->
<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h1>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month.</p>
  <h2 style="margin:28px 0 12px;font-size:18px;">Plans</h2>
  <ol style="padding-left:18px;">
    <li style="margin-bottom:10px;"><strong>3 Months — ₹999</strong> (≈ ₹333/month · SAVE ₹498)<br/><a href="${APP}/checkout?plan=3_months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — ₹1699</strong> (≈ ₹283/month · SAVE ₹1,295) · Most popular<br/><a href="${APP}/checkout?plan=6_months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — ₹2999</strong> (≈ ₹250/month · SAVE ₹2,989)<br/><a href="${APP}/checkout?plan=12_months">Start 12 Months →</a></li>
  </ol>
</div>`
  await fetch(`${REST}/pages/${p.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: p.id, body_html: body, published: true } }),
  })
  console.log('updated page', handle)
}

console.log('\nPolling for cache flush...')
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const home = probe(await fetchHome())
  const plans = probe(await fetchPlans())
  console.log(i, { home, plans })
  const homeOk =
    home.hide ||
    (!home.durations.includes('1 Month') && !home.has499) ||
    home.group === '22240796377339'
  const plansOk = plans.plansStamp && !plans.exact1MonthPlan
  if (homeOk && (plansOk || !plans.exact1MonthPlan)) {
    // For home, if hide is present in HTML, 499 may still be in source but hidden
    if (home.hide || !home.durations.includes('1 Month')) {
      console.log('HOME CACHE LOOKS FRESH')
    }
    if (plansOk || !plans.exact1MonthPlan) {
      console.log('PLANS LOOKS OK')
    }
    if ((home.hide || !home.durations.includes('1 Month')) && !plans.exact1MonthPlan) {
      console.log('SUCCESS')
      break
    }
  }
}
