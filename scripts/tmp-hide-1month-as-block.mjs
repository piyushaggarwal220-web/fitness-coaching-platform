import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const live = themes.find((t) => t.role === 'main')

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
  const json = await res.json()
  return { status: res.status, updated_at: json.asset?.updated_at, errors: json.errors }
}

const BLOCK_KEY = 'blocks/lurvox-hide-1month.liquid'
const BLOCK = `{% comment %} lurvox-hide-1month-block-v1 {% endcomment %}
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
<div hidden data-lurvox-hide-1month="block-v1"></div>

{% schema %}
{
  "name": "Hide 1-month plan",
  "settings": []
}
{% endschema %}
`

const blockPut = await put(BLOCK_KEY, BLOCK)
const blockGet = await get(BLOCK_KEY)
console.log('block put', blockPut)
console.log('block readback', blockGet?.value?.includes('lurvox-hide-1month-block-v1'), blockGet?.value?.length)

const indexAsset = await get('templates/index.json')
const index = JSON.parse(indexAsset.value)
const home = index.sections.home_blocks_v2
if (!home) throw new Error('home_blocks_v2 missing')
home.blocks = home.blocks || {}
home.block_order = home.block_order || Object.keys(home.blocks)

const bid = 'lurvox_hide_1month_block'
home.blocks[bid] = { type: 'lurvox-hide-1month', settings: {} }
if (!home.block_order.includes(bid)) home.block_order.push(bid)

const indexPut = await put('templates/index.json', JSON.stringify(index, null, 2))
const index2 = JSON.parse((await get('templates/index.json')).value)
console.log('index put', indexPut)
console.log('block in home_blocks_v2', !!index2.sections.home_blocks_v2.blocks?.[bid])
console.log('block_order tail', index2.sections.home_blocks_v2.block_order?.slice(-5))

// Also add block into page template _blocks sections if any contain plan cards
for (const key of ['templates/page.json']) {
  try {
    const raw = (await get(key)).value
    const data = JSON.parse(raw)
    let changed = false
    for (const [sid, section] of Object.entries(data.sections || {})) {
      if (section.type !== '_blocks') continue
      // Only inject into sections that already have the plan block
      const hasPlan = Object.values(section.blocks || {}).some((b) =>
        String(b.type || '').includes('361650c')
      )
      if (!hasPlan) continue
      section.blocks = section.blocks || {}
      section.block_order = section.block_order || Object.keys(section.blocks)
      section.blocks[bid] = { type: 'lurvox-hide-1month', settings: {} }
      if (!section.block_order.includes(bid)) section.block_order.push(bid)
      changed = true
      console.log('added hide block into', key, sid)
    }
    if (changed) {
      await put(key, JSON.stringify(data, null, 2))
    }
  } catch (e) {
    console.log('skip', key, e.message)
  }
}

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const hit =
    html.includes('lurvox-hide-1month-style') ||
    html.includes('data-lurvox-hide-1month="block-v1"') ||
    html.includes('lurvox_hide_1month_block')
  console.log(i, {
    hit,
    hasPlan1: html.includes('data-plan-index="1"'),
    // block instance ids often appear in HTML comments or data attributes
    sampleBlocks: [...html.matchAll(/shopify-block[^"]*|lurvox_hide[^"]*/g)].slice(0, 5).map((m) => m[0]),
  })
  if (hit) {
    console.log('SUCCESS')
    break
  }
}
