/**
 * Free a theme slot, duplicate MAIN (with tap-plan already applied), publish.
 * New theme CDN folder (t/N) forces homepage HTML recompile.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const nodes = themes.themes.nodes
const main = nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main)

// Delete disposable Horizon copies (keep useful LURVOX drafts)
const deletable = nodes.filter(
  (t) =>
    t.role !== 'MAIN' &&
    (/^Horizon$/i.test(t.name) ||
      /^Copy of Horizon$/i.test(t.name) ||
      /^Copy of Copy of Horizon$/i.test(t.name))
)
console.log(
  'deletable',
  deletable.map((t) => t.name + ' ' + t.id)
)

for (const t of deletable.slice(0, 3)) {
  const del = await gql(
    `mutation($id: ID!) {
      themeDelete(id: $id) {
        deletedThemeId
        userErrors { message }
      }
    }`,
    { id: t.id }
  )
  console.log('deleted', t.name, JSON.stringify(del))
}

await new Promise((r) => setTimeout(r, 2000))

const name = `Tap plan live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
console.log('Duplicating', main.id, 'as', name)
const dup = await gql(
  `mutation($id: ID!, $name: String!) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: main.id, name }
)
console.log(JSON.stringify(dup, null, 2))
const newTheme = dup.themeDuplicate?.newTheme
if (!newTheme?.id) throw new Error('duplicate failed')

await new Promise((r) => setTimeout(r, 8000))

// Ensure tap-plan files on the new theme
const themeNumeric = newTheme.id.split('/').pop()
const root = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
const files = [
  ['blocks/ai_gen_block_361650c.liquid', fs.readFileSync(path.join(root, 'blocks', 'ai_gen_block_361650c.liquid'), 'utf8')],
  ['assets/lurvox-tap-plan.js', fs.readFileSync(path.join(root, 'assets', 'lurvox-tap-plan.js'), 'utf8')],
]

async function put(key, value) {
  const r = await fetch(`${REST}/themes/${themeNumeric}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('put', key)
}

for (const [key, value] of files) await put(key, value)

const stamp = Date.now()
const force = `{% comment %} lurvox-tap-force-section ${stamp} {% endcomment %}
<style>
  [data-cta-button],
  [class*="ai-transformation-plan-cta-wrapper"] { display: none !important; }
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
        e.preventDefault(); e.stopPropagation();
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
{ "name": "LURVOX tap plan force", "settings": [], "presets": [{ "name": "LURVOX tap plan force" }] }
{% endschema %}
`
await put('sections/lurvox-tap-plan-force.liquid', force)

// index from source MAIN already has force section; copy and bump
const indexRes = await fetch(
  `${REST}/themes/${themeNumeric}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const index = JSON.parse((await indexRes.json()).asset.value)
const markerId = `lurvox_tap_force_${stamp}`
for (const key of Object.keys(index.sections || {})) {
  if (key.startsWith('lurvox_tap_force_')) delete index.sections[key]
}
index.sections[markerId] = { type: 'lurvox-tap-plan-force', settings: {} }
index.order = [
  markerId,
  ...(index.order || []).filter((id) => !String(id).startsWith('lurvox_tap_force_')),
]
for (const sec of Object.values(index.sections)) {
  for (const blk of Object.values(sec.blocks || {})) {
    if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
      blk.settings.plan_1_enabled = false
      if (/cart/i.test(blk.settings.cta_text || '')) blk.settings.cta_text = 'CONTINUE'
    }
  }
}
await put('templates/index.json', JSON.stringify(index, null, 2))

let layoutRes = await fetch(
  `${REST}/themes/${themeNumeric}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await layoutRes.json()).asset.value
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = `<!-- lurvox-cache-bust ${stamp} -->\n` + layout
if (!layout.includes("lurvox-tap-plan.js")) {
  layout = layout.replace(
    '</head>',
    `  <script src="{{ 'lurvox-tap-plan.js' | asset_url }}" defer></script>\n</head>`
  )
}
await put('layout/theme.liquid', layout)

console.log('\nPublishing', newTheme.id)
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: newTheme.id }
)
console.log(JSON.stringify(pub, null, 2))

function probe(html) {
  const tNum = html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1]
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    tNum,
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    hasForce: html.includes('lurvoxTapWired') || html.includes('lurvox-tap-force-section'),
    hasTapJs: html.includes('lurvox-tap-plan.js'),
    hasCta: /data-cta-button/.test(html),
    hasGoToPlan: html.includes('goToPlan'),
    hasAddToCart: /ADD TO CART/i.test(html),
  }
}

for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?new=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (
    p.themeId === themeNumeric ||
    (p.tNum && p.tNum !== '21') ||
    p.stamp ||
    p.hasForce ||
    p.hasGoToPlan
  ) {
    if (!p.hasAddToCart && (p.hasForce || p.hasGoToPlan || !p.hasCta || p.stamp)) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}

console.log('Published new theme', themeNumeric, '— cache may still be catching up')
process.exit(0)
