/**
 * Force homepage recompile on the edge-served theme (161294057723):
 * - remove CTA from plan block (already done, re-upload)
 * - tap card → plan link
 * - structural index.json change to bust sticky homepage HTML
 * - publish this theme as MAIN so edge id matches
 */
import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${API}/graphql.json`
const EDGE = '161294057723'
const EDGE_GID = `gid://shopify/OnlineStoreTheme/${EDGE}`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function get(key) {
  const r = await fetch(
    `${API}/themes/${EDGE}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  if (!r.ok || !j.asset?.value) throw new Error(`GET ${key}`)
  return j.asset.value
}

async function put(key, value) {
  const r = await fetch(`${API}/themes/${EDGE}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`PUT ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', key)
}

const liquid = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'blocks', 'ai_gen_block_361650c.liquid'),
  'utf8'
)
await put('blocks/ai_gen_block_361650c.liquid', liquid)

// Ensure hide section hides CTA + wires tap (belt and suspenders)
const hide = `{% comment %} lurvox-tap-plan-force-v1 ${Date.now()} {% endcomment %}
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"],
  [data-plan-price="179"],
  [data-plan-price="999"],
  [data-plan-price="499"],
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"],
  [data-cta-button],
  [class*="ai-transformation-plan-cta-wrapper"] {
    display: none !important;
  }
</style>
<script>
(function(){
  function wire(){
    document.querySelectorAll('[data-cta-button],[class*="ai-transformation-plan-cta-wrapper"]').forEach(function(el){
      el.style.setProperty('display','none','important');
    });
    document.querySelectorAll('[class*="ai-transformation-plan-card-"][data-plan-link]').forEach(function(card){
      if (card.dataset.lurvoxTapWired === '1') return;
      card.dataset.lurvoxTapWired = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(e){
        var link = card.getAttribute('data-plan-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        window.location.href = link;
      }, true);
    });
  }
  wire();
  document.addEventListener('DOMContentLoaded', wire);
  setTimeout(wire, 400);
  setTimeout(wire, 1500);
})();
</script>
{% schema %}
{
  "name": "LURVOX hide 1-month",
  "settings": [],
  "presets": [{ "name": "LURVOX hide 1-month" }]
}
{% endschema %}
`
await put('sections/lurvox-hide-1month.liquid', hide)

// Structural index change + ensure hide section is in homepage order
const index = JSON.parse(await get('templates/index.json'))
const markerId = `lurvox_tap_force_${Date.now()}`
index.sections = index.sections || {}
index.sections[markerId] = {
  type: 'apps',
  settings: {},
  blocks: {
    [markerId + '_note']: {
      type: 'app',
      disabled: true,
      settings: {},
    },
  },
  block_order: [markerId + '_note'],
}
if (!Array.isArray(index.order)) index.order = []
if (!index.order.includes(markerId)) index.order.unshift(markerId)

// Keep plan CTA label non-cart if settings still present
for (const sec of Object.values(index.sections)) {
  for (const blk of Object.values(sec.blocks || {})) {
    if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
      blk.settings.plan_1_enabled = false
      if (/cart/i.test(blk.settings.cta_text || '')) {
        blk.settings.cta_text = 'CONTINUE'
      }
    }
  }
}

await put('templates/index.json', JSON.stringify(index, null, 2))

// Touch layout
let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = layout.replace(
  /\n?\s*<script src="\{\{ 'lurvox-tap-plan.js' \| asset_url \}\}" defer><\/script>/g,
  ''
)
layout = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + layout
if (!layout.includes("lurvox-tap-plan.js")) {
  layout = layout.replace(
    '</head>',
    `  <script src="{{ 'lurvox-tap-plan.js' | asset_url }}" defer></script>\n</head>`
  )
}
await put('layout/theme.liquid', layout)

// Upload JS asset on edge theme
const js = fs.existsSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'assets', 'lurvox-tap-plan.js')
)
  ? fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'assets', 'lurvox-tap-plan.js'),
      'utf8'
    )
  : `/*! lurvox-tap-plan v1 */
(function(){
  function hideCtas(){
    document.querySelectorAll('[data-cta-button],[class*="ai-transformation-plan-cta-wrapper"]').forEach(function(el){
      el.style.setProperty('display','none','important');
    });
  }
  function wireCards(){
    document.querySelectorAll('[class*="ai-transformation-plan-card-"][data-plan-link]').forEach(function(card){
      if (card.dataset.lurvoxTapWired==='1') return;
      card.dataset.lurvoxTapWired='1';
      card.style.cursor='pointer';
      card.addEventListener('click', function(e){
        var link=card.getAttribute('data-plan-link');
        if(!link) return;
        e.preventDefault(); e.stopPropagation();
        window.location.href=link;
      }, true);
    });
  }
  function run(){ hideCtas(); wireCards(); }
  run();
  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 300);
  setTimeout(run, 1200);
})();`

await put('assets/lurvox-tap-plan.js', js)

console.log('\nPublishing edge theme as MAIN...')
console.log(
  JSON.stringify(
    await gql(
      `mutation($id: ID!) {
        themePublish(id: $id) {
          theme { id name role }
          userErrors { message }
        }
      }`,
      { id: EDGE_GID }
    ),
    null,
    2
  )
)

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    hasTapForce: html.includes('lurvox-tap-plan-force') || html.includes('lurvoxTapWired'),
    hasTapJs: html.includes('lurvox-tap-plan.js'),
    hasCtaButton: /data-cta-button/.test(html),
    hasAddToCart: /ADD TO CART/i.test(html),
    marker: html.includes('lurvox_tap_force_') || /lurvox_tap_force_/.test(html),
  }
}

for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?re=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (p.stamp || p.hasTapForce || p.hasTapJs) {
    console.log('HOMEPAGE RECOMPILED')
    process.exit(0)
  }
}

console.log('Still sticky — open Theme Editor and hit Save on homepage to force flush')
process.exit(1)
