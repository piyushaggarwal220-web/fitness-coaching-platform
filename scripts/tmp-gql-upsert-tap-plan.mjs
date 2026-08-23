/**
 * GraphQL themeFilesUpsert to force homepage recompile with tap-to-plan.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME_ID = '161294057723'
const THEME_GID = `gid://shopify/OnlineStoreTheme/${THEME_ID}`
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

async function get(key) {
  const r = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const j = await r.json()
  if (!j.asset?.value) throw new Error(`missing ${key}`)
  return j.asset.value
}

const stamp = Date.now()
const root = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
const liquid = fs.readFileSync(path.join(root, 'blocks', 'ai_gen_block_361650c.liquid'), 'utf8')
const js = fs.readFileSync(path.join(root, 'assets', 'lurvox-tap-plan.js'), 'utf8')

const forceSection = `{% comment %} lurvox-tap-force-section ${stamp} {% endcomment %}
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

const index = JSON.parse(await get('templates/index.json'))
const markerId = `lurvox_tap_force_${stamp}`
// remove old force sections
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

let layout = await get('layout/theme.liquid')
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
layout = `<!-- lurvox-cache-bust ${stamp} -->\n` + layout
if (!layout.includes("lurvox-tap-plan.js")) {
  layout = layout.replace(
    '</head>',
    `  <script src="{{ 'lurvox-tap-plan.js' | asset_url }}" defer></script>\n</head>`
  )
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: THEME_GID,
    files: [
      {
        filename: 'blocks/ai_gen_block_361650c.liquid',
        body: { type: 'TEXT', value: liquid },
      },
      {
        filename: 'sections/lurvox-tap-plan-force.liquid',
        body: { type: 'TEXT', value: forceSection },
      },
      {
        filename: 'templates/index.json',
        body: { type: 'TEXT', value: JSON.stringify(index, null, 2) },
      },
      {
        filename: 'layout/theme.liquid',
        body: { type: 'TEXT', value: layout },
      },
      {
        filename: 'assets/lurvox-tap-plan.js',
        body: { type: 'TEXT', value: js },
      },
    ],
  }
)
console.log(JSON.stringify(upsert, null, 2))

// republish
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: THEME_GID }
)

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    hasForce: html.includes(`lurvox-tap-force-section ${stamp}`) || html.includes('lurvoxTapWired'),
    hasTapJs: html.includes('lurvox-tap-plan.js'),
    hasCta: /data-cta-button/.test(html),
    hasGoToPlan: html.includes('goToPlan'),
    ctaText: /START YOUR TRANSFORMATION|ADD TO CART/i.test(html),
  }
}

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?gql=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (p.stamp || p.hasForce || p.hasGoToPlan || (p.hasTapJs && !p.hasCta)) {
    console.log('SUCCESS')
    process.exit(0)
  }
}
process.exit(1)
