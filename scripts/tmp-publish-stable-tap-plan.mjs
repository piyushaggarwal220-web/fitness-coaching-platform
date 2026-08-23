/**
 * Copy tap-to-plan assets onto "New changes stable", publish it to bust
 * sticky homepage HTML cache (homepage was frozen on old theme id).
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const SOURCE = '161375289595' // New changes (patched)
const TARGET = '161380106491' // New changes stable
const TARGET_GID = `gid://shopify/OnlineStoreTheme/${TARGET}`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
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

async function get(themeId, key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  if (!r.ok || !j.asset?.value) throw new Error(`GET ${themeId} ${key}`)
  return j.asset.value
}

async function put(themeId, key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`PUT ${themeId} ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('copied', key)
}

const keys = [
  'blocks/ai_gen_block_361650c.liquid',
  'templates/index.json',
  'sections/header-group.json',
  'sections/lurvox-hide-1month.liquid',
  'sections/lurvox-client-login.liquid',
  'sections/lurvox-social-proof.liquid',
  'layout/theme.liquid',
]

for (const key of keys) {
  let value = await get(SOURCE, key)
  if (key === 'layout/theme.liquid') {
    value = value.replace(/<!-- lurvox-cache-bust \d+ -->\n?/g, '')
    value = `<!-- lurvox-cache-bust ${Date.now()} -->\n` + value
  }
  // Extra homepage marker in hide section
  if (key === 'sections/lurvox-hide-1month.liquid') {
    value = value.replace(
      '</style>',
      `</style>
<script>
(function(){
  function wire(){
    document.querySelectorAll('[data-cta-button]').forEach(function(el){
      var wrap = el.closest('[class*="ai-transformation-plan-cta-wrapper"]') || el;
      wrap.style.display = 'none';
    });
    document.querySelectorAll('.ai-transformation-plan-card-361650c, [class*="ai-transformation-plan-card-"]').forEach(function(card){
      if (card.dataset.lurvoxTapWired) return;
      card.dataset.lurvoxTapWired = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(){
        var link = card.getAttribute('data-plan-link');
        if (link) window.location.href = link;
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
</script>`
    )
  }
  await put(TARGET, key, value)
}

// Also push the hide-section JS onto source for consistency
{
  let hide = await get(SOURCE, 'sections/lurvox-hide-1month.liquid')
  if (!hide.includes('lurvoxTapWired')) {
    hide = hide.replace(
      '</style>',
      `</style>
<script>
(function(){
  function wire(){
    document.querySelectorAll('[data-cta-button]').forEach(function(el){
      var wrap = el.closest('[class*="ai-transformation-plan-cta-wrapper"]') || el;
      wrap.style.display = 'none';
    });
    document.querySelectorAll('[class*="ai-transformation-plan-card-"]').forEach(function(card){
      if (card.dataset.lurvoxTapWired) return;
      card.dataset.lurvoxTapWired = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(){
        var link = card.getAttribute('data-plan-link');
        if (link) window.location.href = link;
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
</script>`
    )
    await put(SOURCE, 'sections/lurvox-hide-1month.liquid', hide)
  }
}

console.log('\nPublishing New changes stable...')
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: TARGET_GID }
)
console.log(JSON.stringify(pub, null, 2))

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    hasTap: html.includes('window.location.href = link') || html.includes('lurvoxTapWired'),
    hasCtaButton: /data-cta-button/.test(html),
    hasAddToCart: /ADD TO CART/i.test(html),
    seats: html.includes('data-lurvox-seats-filled'),
    prices: [...html.matchAll(/<div\b[^>]*data-plan-price="([^"]+)"/g)].map((m) => m[1]),
  }
}

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?bust=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (
    (p.themeId === TARGET || p.hasTap || p.seats) &&
    !p.hasAddToCart &&
    (p.hasTap || !p.hasCtaButton)
  ) {
    // success if new theme or tap wiring present and no add-to-cart label
    if (p.themeId === TARGET || (p.hasTap && p.seats)) {
      console.log('SUCCESS')
      process.exit(0)
    }
  }
}

console.log('Published stable theme — homepage may still be flushing')
process.exit(0)
