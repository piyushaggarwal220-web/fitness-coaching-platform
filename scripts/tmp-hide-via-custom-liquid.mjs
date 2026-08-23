import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}
async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  return { status: res.status, updated_at: json.asset?.updated_at }
}

const customLiquid = await get('blocks/custom-liquid.liquid')
const schema = customLiquid.slice(customLiquid.indexOf('{% schema %}'))
console.log(schema.slice(0, 600))

const LIQUID = `<!-- lurvox-hide-1month-custom-liquid-v1 -->
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"] { display: none !important; }
</style>
<script>
(function () {
  function hideOneMonthPlan() {
    document.querySelectorAll('[data-plan-index="1"]').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('hidden', 'true');
      el.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('a[href*="plans/1-month"], a[href*="plan=1_month"]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.setAttribute('href', href.replace(/plans\\/1-month/g, 'plans/3-months').replace(/plan=1_month/g, 'plan=3_months'));
    });
    var cta = document.querySelector('[data-cta-button]');
    if (cta && /1-month|1_month/.test(cta.getAttribute('href') || '')) {
      var three = document.querySelector('[data-plan-index="2"]');
      cta.setAttribute('href', (three && three.getAttribute('data-plan-link')) || '${APP}/plans/3-months');
    }
    var selected = document.querySelector('[data-plan-index="1"].selected');
    if (selected) {
      selected.classList.remove('selected');
      var next = document.querySelector('[data-plan-index="2"], [data-plan-index="3"], [data-plan-index="4"]');
      if (next) {
        next.classList.add('selected');
        var nextCta = document.querySelector('[data-cta-button]');
        if (nextCta && next.getAttribute('data-plan-link')) nextCta.setAttribute('href', next.getAttribute('data-plan-link'));
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideOneMonthPlan);
  else hideOneMonthPlan();
  setTimeout(hideOneMonthPlan, 400);
  setTimeout(hideOneMonthPlan, 1200);
})();
</script>
<div hidden data-lurvox-hide-1month="custom-liquid-v1"></div>
`

const index = JSON.parse(await get('templates/index.json'))
const home = index.sections.home_blocks_v2
home.blocks = home.blocks || {}
home.block_order = home.block_order || Object.keys(home.blocks)

// Remove non-rendering custom block if present
delete home.blocks.lurvox_hide_1month_block
home.block_order = home.block_order.filter((id) => id !== 'lurvox_hide_1month_block')

const bid = 'lurvox_hide_1month_cl'
home.blocks[bid] = {
  type: 'custom-liquid',
  settings: {
    // common setting ids for custom liquid blocks
    custom_liquid: LIQUID,
    liquid: LIQUID,
  },
}
if (!home.block_order.includes(bid)) home.block_order.push(bid)

// Keep plan_1 disabled
const planBlock = Object.values(home.blocks).find((b) => String(b.type).includes('361650c'))
if (planBlock?.settings) {
  planBlock.settings.plan_1_enabled = false
  planBlock.settings.plan_1_default = false
}

const putRes = await put('templates/index.json', JSON.stringify(index, null, 2))
console.log('index put', putRes)

const verify = JSON.parse(await get('templates/index.json'))
const cl = verify.sections.home_blocks_v2.blocks[bid]
console.log('custom liquid block settings keys', Object.keys(cl.settings || {}))
console.log('has liquid content', JSON.stringify(cl.settings).includes('lurvox-hide-1month-custom-liquid-v1'))

// Also inject into page.json _blocks that have plan cards
try {
  const page = JSON.parse(await get('templates/page.json'))
  let changed = false
  for (const section of Object.values(page.sections || {})) {
    if (section.type !== '_blocks') continue
    const hasPlan = Object.values(section.blocks || {}).some((b) => String(b.type).includes('361650c'))
    if (!hasPlan) continue
    section.blocks[bid] = {
      type: 'custom-liquid',
      settings: { custom_liquid: LIQUID, liquid: LIQUID },
    }
    section.block_order = section.block_order || Object.keys(section.blocks)
    if (!section.block_order.includes(bid)) section.block_order.push(bid)
    changed = true
  }
  if (changed) {
    await put('templates/page.json', JSON.stringify(page, null, 2))
    console.log('page.json updated')
  }
} catch (e) {
  console.log('page.json', e.message)
}

// Republish to encourage flush
await fetch(`${REST}/themes/${main.id}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ theme: { id: Number(main.id), role: 'main' } }),
})

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await fetch(
    `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${main.id}&cb=${Date.now()}-${i}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
  ).then((r) => r.text())
  const live = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const hitPreview =
    html.includes('lurvox-hide-1month-custom-liquid-v1') || html.includes('lurvox-hide-1month-style')
  const hitLive =
    live.includes('lurvox-hide-1month-custom-liquid-v1') || live.includes('lurvox-hide-1month-style')
  console.log(i, {
    hitPreview,
    hitLive,
    previewHasClBlock: html.includes('lurvox_hide_1month_cl'),
    liveHasClBlock: live.includes('lurvox_hide_1month_cl'),
  })
  if (hitPreview || hitLive) {
    console.log('SUCCESS')
    break
  }
}
