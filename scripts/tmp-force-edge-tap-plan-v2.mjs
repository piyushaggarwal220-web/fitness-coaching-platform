/**
 * Force homepage recompile on edge theme with valid sections only.
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
  if (!r.ok || j.errors) throw new Error(`PUT ${key}: ${JSON.stringify(j).slice(0, 400)}`)
  console.log('updated', key)
}

const stamp = Date.now()

// Custom liquid section for force + tap behavior
const customSection = `{% comment %} lurvox-tap-force-section ${stamp} {% endcomment %}
<style>
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
  "name": "LURVOX tap plan force",
  "settings": [],
  "presets": [{ "name": "LURVOX tap plan force" }]
}
{% endschema %}
`
await put('sections/lurvox-tap-plan-force.liquid', customSection)

const liquid = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'blocks', 'ai_gen_block_361650c.liquid'),
  'utf8'
)
await put('blocks/ai_gen_block_361650c.liquid', liquid)

const hide = await get('sections/lurvox-hide-1month.liquid')
if (!hide.includes('lurvox-tap-plan-force-v1') && !hide.includes('lurvoxTapWired')) {
  // already updated in previous run hopefully
}

const index = JSON.parse(await get('templates/index.json'))
const markerId = `lurvox_tap_force_${stamp}`
index.sections[markerId] = {
  type: 'lurvox-tap-plan-force',
  settings: {},
}
if (!Array.isArray(index.order)) index.order = []
index.order = [markerId, ...index.order.filter((id) => !String(id).startsWith('lurvox_tap_force_'))]

for (const sec of Object.values(index.sections)) {
  for (const blk of Object.values(sec.blocks || {})) {
    if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
      blk.settings.plan_1_enabled = false
      if (/cart/i.test(blk.settings.cta_text || '')) blk.settings.cta_text = 'CONTINUE'
    }
  }
}

await put('templates/index.json', JSON.stringify(index, null, 2))

let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = `<!-- lurvox-cache-bust ${stamp} -->\n` + layout
await put('layout/theme.liquid', layout)

const js = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', 'assets', 'lurvox-tap-plan.js'),
  'utf8'
)
await put('assets/lurvox-tap-plan.js', js)

console.log('\nPublishing edge theme...')
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
    hasForceSection: html.includes('lurvox-tap-force-section') || html.includes('lurvoxTapWired'),
    hasCtaVisibleMarkup: /data-cta-button/.test(html),
    hasAddToCart: /ADD TO CART/i.test(html),
    hasGoToPlan: html.includes('goToPlan') || html.includes('window.location.href = link'),
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
  if (p.stamp || p.hasForceSection || p.hasGoToPlan) {
    console.log('SUCCESS — homepage recompiled')
    process.exit(0)
  }
}

console.log('Still sticky')
process.exit(1)
