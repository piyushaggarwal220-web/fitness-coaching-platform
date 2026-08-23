import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const live = themes.find((t) => t.role === 'main')
const KEY = 'sections/mobile-floating-bar.liquid'
const MARKER_START = '{%- comment -%} lurvox-hide-1month-fab-v2 {%- endcomment -%}'
const MARKER_END = '{%- comment -%} /lurvox-hide-1month-fab-v2 {%- endcomment -%}'

const SNIPPET = `
${MARKER_START}
<style id="lurvox-hide-1month-style">[data-plan-index="1"]{display:none!important}</style>
<script>
(function(){
  function hideOneMonthPlan(){
    document.querySelectorAll('[data-plan-index="1"]').forEach(function(el){
      el.style.setProperty('display','none','important');
      el.setAttribute('hidden','true');
      el.setAttribute('aria-hidden','true');
    });
    document.querySelectorAll('a[href*="plans/1-month"],a[href*="plan=1_month"]').forEach(function(a){
      var href=a.getAttribute('href')||'';
      a.setAttribute('href', href.replace(/plans\\/1-month/g,'plans/3-months').replace(/plan=1_month/g,'plan=3_months'));
    });
    var cta=document.querySelector('[data-cta-button]');
    if(cta && /1-month|1_month/.test(cta.getAttribute('href')||'')){
      var three=document.querySelector('[data-plan-index="2"]');
      cta.setAttribute('href', (three && three.getAttribute('data-plan-link')) || '${APP}/plans/3-months');
    }
    var selected=document.querySelector('[data-plan-index="1"].selected');
    if(selected){
      selected.classList.remove('selected');
      var next=document.querySelector('[data-plan-index="2"],[data-plan-index="3"],[data-plan-index="4"]');
      if(next){
        next.classList.add('selected');
        var nextCta=document.querySelector('[data-cta-button]');
        if(nextCta && next.getAttribute('data-plan-link')) nextCta.setAttribute('href', next.getAttribute('data-plan-link'));
      }
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', hideOneMonthPlan);
  else hideOneMonthPlan();
  setTimeout(hideOneMonthPlan, 400);
  setTimeout(hideOneMonthPlan, 1200);
})();
</script>
<div hidden data-lurvox-hide-1month="fab-v2"></div>
${MARKER_END}
`

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset
}

async function put(key, value) {
  const res = await fetch(`${REST}/themes/${live.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  return { status: res.status, ...(await res.json()) }
}

// Also try GraphQL themeFilesUpsert for floating bar
let fab = (await get(KEY)).value
console.log('before bytes', fab.length)
console.log('before has v1', fab.includes('lurvox-hide-1month-fab-v1'))
console.log('before has v2', fab.includes('lurvox-hide-1month-fab-v2'))
console.log('before has style', fab.includes('lurvox-hide-1month-style'))

// Strip old injections
fab = fab
  .replace(/<!-- lurvox-hide-1month-fab-v1 -->[\s\S]*?$/g, '')
  .replace(/\{%- comment -%\} lurvox-hide-1month-fab-v2[\s\S]*?\{%- comment -%\} \/lurvox-hide-1month-fab-v2 \{%- endcomment -%\}/g, '')
  .replace(/<script src="\{\{ 'lurvox-hide-1month\.js' \| asset_url \}\}" defer><\/script>\n?/g, '')

fab = fab.trimEnd() + '\n' + SNIPPET + '\n'

const restPut = await put(KEY, fab)
console.log('REST put', restPut.status, restPut.asset?.updated_at)

const gqlPut = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${live.id}`,
      files: [{ filename: KEY, body: { type: 'TEXT', value: fab } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL upsert', JSON.stringify(gqlPut.data?.themeFilesUpsert || gqlPut.errors))

const after = await get(KEY)
console.log('after has v2', after.value.includes('lurvox-hide-1month-fab-v2'))
console.log('after has style', after.value.includes('lurvox-hide-1month-style'))
console.log('after bytes', after.value.length, 'updated', after.updated_at)

// Fetch rendered floating bar section HTML
const sectionHtml = await fetch(
  `https://www.lurvox.in/?sections=mobile-floating-bar&cb=${Date.now()}`,
  { headers: { 'User-Agent': 'Mozilla/5.0' } }
).then((r) => r.json())
const rendered = sectionHtml['mobile-floating-bar'] || ''
console.log('rendered section has style', rendered.includes('lurvox-hide-1month-style'))
console.log('rendered section has marker', rendered.includes('data-lurvox-hide-1month'))
console.log('rendered bytes', rendered.length)

// Also update plans page via REST pages API
const pagesRest = await fetch(`${REST}/pages.json?handle=plans`, { headers }).then((r) => r.json())
console.log('rest pages', pagesRest.pages?.map((p) => ({ id: p.id, handle: p.handle, body_len: p.body_html?.length })))

const plansPage = pagesRest.pages?.[0]
if (plansPage) {
  const body = `<!-- lurvox-plans-no-1month ${Date.now()} -->
<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h1>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month. Secure checkout opens on the LURVOX app.</p>
  <h2 style="margin:28px 0 10px;font-size:18px;">Everything included</h2>
  <ul style="margin:0 0 24px;padding-left:18px;color:#333;">
    <li>Personal workout plan (gym, home, or both)</li>
    <li>Personal diet plan (veg / non-veg / allergies supported)</li>
    <li>Weekly coach check-ins with a real human coach</li>
    <li>Direct coach chat inside the client app</li>
    <li>Daily trackers: workout, diet, water, sleep, steps, supplements + habits</li>
    <li>Progress photos, measurements, and journey timeline</li>
    <li>Weekly plan updates based on your real progress</li>
  </ul>
  <h2 style="margin:28px 0 10px;font-size:18px;">Plans</h2>
  <ol style="margin:0 0 8px;padding-left:18px;">
    <li style="margin-bottom:10px;"><strong>3 Months — Rs 999</strong> (approx Rs 333/month · SAVE Rs 498)<br/><a href="${APP}/plans/3-months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — Rs 1699</strong> (approx Rs 283/month · SAVE Rs 1,295) · Most popular<br/><a href="${APP}/plans/6-months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — Rs 2999</strong> (approx Rs 250/month · SAVE Rs 2,989) · Best value<br/><a href="${APP}/plans/12-months">Start 12 Months →</a></li>
  </ol>
  <p style="margin:24px 0 8px;color:#444;">After payment: create account → assessment + photos → personal plan delivered within 24–48 hours.</p>
  <p style="margin:0;"><a href="/">Or view plans on the homepage →</a></p>
</div>`

  const pagePut = await fetch(`${REST}/pages/${plansPage.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: plansPage.id, body_html: body, published: true } }),
  }).then(async (r) => ({ status: r.status, body: await r.text() }))
  console.log('REST page put', pagePut.status, pagePut.body.slice(0, 250))
}

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3500))
  const home = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const plans = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const sec = await fetch(`https://www.lurvox.in/?sections=mobile-floating-bar&cb=${Date.now()}-${i}`).then((r) =>
    r.json()
  )
  console.log(i, {
    homeStyle: home.includes('lurvox-hide-1month-style'),
    sectionStyle: (sec['mobile-floating-bar'] || '').includes('lurvox-hide-1month-style'),
    plansStamp: plans.includes('lurvox-plans-no-1month'),
    plansExact1: /(?<!\d)1 Month/.test(plans),
  })
  if (
    home.includes('lurvox-hide-1month-style') &&
    plans.includes('lurvox-plans-no-1month') &&
    !/(?<!\d)1 Month/.test(plans)
  ) {
    console.log('SUCCESS')
    break
  }
}
