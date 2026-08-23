/**
 * Promote New changes → live, excluding:
 * - 7-day trial plan
 * - add-to-cart drawer (CTA goes straight to checkout)
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const SOURCE_THEME_ID = '161375289595' // New changes
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
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

async function getAsset(themeId, key) {
  const r = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  if (!r.ok || !j.asset?.value) throw new Error(`GET ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  return j.asset.value
}

async function putAsset(themeId, key, value) {
  const r = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`PUT ${key}: ${JSON.stringify(j).slice(0, 400)}`)
  console.log('updated', key)
}

const HIDE_LIQUID = `{% comment %} lurvox-hide-trial-and-1month-v1 {% endcomment %}
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"],
  [data-plan-price="179"],
  [data-plan-price="999"],
  [data-plan-price="499"],
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"] {
    display: none !important;
  }
</style>
{% schema %}
{
  "name": "LURVOX hide 1-month",
  "settings": [],
  "presets": [{ "name": "LURVOX hide 1-month" }]
}
{% endschema %}
`

function stripCartFromHeaderGroup(raw) {
  const hg = JSON.parse(raw)
  if (hg.sections?.lurvox_cart_drawer) {
    delete hg.sections.lurvox_cart_drawer
  }
  if (Array.isArray(hg.order)) {
    hg.order = hg.order.filter((id) => id !== 'lurvox_cart_drawer')
  }
  return JSON.stringify(hg, null, 2)
}

function stripTrialFromIndex(raw) {
  const index = JSON.parse(raw)
  const changes = []

  for (const sec of Object.values(index.sections || {})) {
    for (const blk of Object.values(sec.blocks || {})) {
      if (blk.type === 'ai_gen_block_361650c' && blk.settings) {
        if (blk.settings.plan_1_enabled !== false) {
          blk.settings.plan_1_enabled = false
          changes.push('plan_1_enabled=false')
        }
        if (/7 days|trial/i.test(blk.settings.subheadline || '')) {
          blk.settings.subheadline =
            'Pick 3 / 6 / 12 months. Same full coaching on every plan. Use WELCOME60 for 60% off.'
          changes.push('subheadline')
        }
      }
      const cl = blk?.settings?.custom_liquid
      if (typeof cl === 'string' && /lurvox-hide|data-plan-index/.test(cl)) {
        blk.settings.custom_liquid = `<!-- lurvox-hide-trial-and-1month-v1 -->
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"],
  [data-plan-price="179"],
  [data-plan-price="999"],
  [data-plan-price="499"],
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"] {
    display: none !important;
  }
</style>
`
        changes.push('hide custom liquid')
      }
    }
  }

  if (index.sections?.lurvox_trial_card) {
    delete index.sections.lurvox_trial_card
    changes.push('removed lurvox_trial_card')
  }
  if (index.sections?.lurvox_cart_drawer) {
    delete index.sections.lurvox_cart_drawer
    changes.push('removed lurvox_cart_drawer from index')
  }
  if (Array.isArray(index.order)) {
    const before = index.order.length
    index.order = index.order.filter(
      (id) => id !== 'lurvox_trial_card' && id !== 'lurvox_cart_drawer'
    )
    if (index.order.length !== before) changes.push('cleaned index.order')
  }

  return { value: JSON.stringify(index, null, 2), changes }
}

function patchPlanBlockDirectCheckout(liquid) {
  let next = liquid
  const clickOld = `        if (this.ctaButton) {
          this.ctaButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.addSelectedToCart();
          });
        }`
  const clickNew = `        if (this.ctaButton) {
          this.ctaButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.proceedToCheckout();
          });
        }`
  if (!next.includes(clickOld)) {
    throw new Error('CTA click handler not found for patch')
  }
  next = next.replace(clickOld, clickNew)

  const methodOld = `      addSelectedToCart() {
        const selectedCard = this.querySelector('.ai-transformation-plan-card-{{ ai_gen_id }}.selected');
        if (!selectedCard) return;
        const sale = parseInt(selectedCard.getAttribute('data-plan-sale') || selectedCard.getAttribute('data-plan-price'), 10) || 0;
        const mrp = parseInt(selectedCard.getAttribute('data-plan-mrp') || String(sale), 10) || sale;
        const detail = {
          title: selectedCard.getAttribute('data-plan-title') || 'LURVOX Coaching',
          duration: selectedCard.getAttribute('data-plan-duration') || '',
          sale: sale,
          mrp: mrp,
          code: selectedCard.getAttribute('data-discount-code') || 'WELCOME60',
          applyDiscount: selectedCard.getAttribute('data-apply-discount') !== 'false',
          checkoutUrl: selectedCard.getAttribute('data-plan-link') || '#'
        };
        window.dispatchEvent(new CustomEvent('lurvox:add-to-cart', { detail: detail }));
      }`
  const methodNew = `      proceedToCheckout() {
        const selectedCard = this.querySelector('.ai-transformation-plan-card-{{ ai_gen_id }}.selected');
        if (!selectedCard) return;
        const link = selectedCard.getAttribute('data-plan-link') || '';
        if (link) window.location.href = link;
      }`
  if (!next.includes(methodOld)) {
    throw new Error('addSelectedToCart method not found for patch')
  }
  next = next.replace(methodOld, methodNew)
  return next
}

function probe(html) {
  const cards = [...html.matchAll(/<div\b[^>]*data-plan-index="[^"]*"[^>]*>/g)].map((m) => {
    const tag = m[0]
    return {
      index: /data-plan-index="([^"]*)"/.exec(tag)?.[1],
      price: /data-plan-price="([^"]*)"/.exec(tag)?.[1],
      link: /data-plan-link="([^"]*)"/.exec(tag)?.[1],
    }
  })
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    themeName: html.match(/"name":"([^"]+)","id":\d+/)?.[1],
    hasCartDrawer: html.includes('lurvox-cart-drawer') || html.includes('id="lurvox-cart-drawer"'),
    hasAddToCartEvent: html.includes('lurvox:add-to-cart'),
    hasProceed: html.includes('proceedToCheckout'),
    has7DayLabel: html.includes('7-DAY TRIAL'),
    hasTrialSection: html.includes('7-Day All-Access Trial'),
    cards,
  }
}

// --- 1) Duplicate New changes ---
const name = `New changes live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
console.log('Duplicating New changes as', name)
const dup = await gql(
  `mutation($id: ID!, $name: String!) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${SOURCE_THEME_ID}`, name }
)
console.log(JSON.stringify(dup, null, 2))
if (dup.themeDuplicate?.userErrors?.length) {
  throw new Error(JSON.stringify(dup.themeDuplicate.userErrors))
}
const newThemeGid = dup.themeDuplicate?.newTheme?.id
if (!newThemeGid) throw new Error('duplicate failed')
const THEME_ID = newThemeGid.split('/').pop()
console.log('New theme numeric id', THEME_ID)

// Wait for duplicate assets to settle
await new Promise((r) => setTimeout(r, 5000))

// --- 2) Patch assets ---
const headerGroup = await getAsset(THEME_ID, 'sections/header-group.json')
await putAsset(THEME_ID, 'sections/header-group.json', stripCartFromHeaderGroup(headerGroup))

const indexRaw = await getAsset(THEME_ID, 'templates/index.json')
const { value: indexValue, changes } = stripTrialFromIndex(indexRaw)
console.log('index changes:', changes)
await putAsset(THEME_ID, 'templates/index.json', indexValue)

await putAsset(THEME_ID, 'sections/lurvox-hide-1month.liquid', HIDE_LIQUID)

const planBlock = await getAsset(THEME_ID, 'blocks/ai_gen_block_361650c.liquid')
const patchedPlan = patchPlanBlockDirectCheckout(planBlock)
await putAsset(THEME_ID, 'blocks/ai_gen_block_361650c.liquid', patchedPlan)

// Keep local copies in sync for future edits
const localDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
try {
  fs.writeFileSync(
    path.join(localDir, 'sections', 'header-group.json'),
    stripCartFromHeaderGroup(fs.readFileSync(path.join(localDir, 'sections', 'header-group.json'), 'utf8'))
  )
  fs.writeFileSync(path.join(localDir, 'blocks', 'ai_gen_block_361650c.liquid'), patchedPlan)
  fs.writeFileSync(path.join(localDir, 'sections', 'lurvox-hide-1month.liquid'), HIDE_LIQUID)
  const localIndex = stripTrialFromIndex(
    fs.readFileSync(path.join(localDir, 'templates', 'index.json'), 'utf8')
  )
  fs.writeFileSync(path.join(localDir, 'templates', 'index.json'), localIndex.value)
  console.log('synced local tmp-new-changes-theme copies')
} catch (e) {
  console.warn('local sync skipped:', e.message)
}

// --- 3) Publish ---
console.log('\nPublishing', THEME_ID)
const pub = await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: newThemeGid }
)
console.log(JSON.stringify(pub, null, 2))
if (pub.themePublish?.userErrors?.length) {
  throw new Error(JSON.stringify(pub.themePublish.userErrors))
}

// --- 4) Verify storefront ---
console.log('\nVerifying homepage...')
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const html = await (
    await fetch(`https://www.lurvox.in/?v=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const p = probe(html)
  console.log(i, JSON.stringify(p))
  if (
    p.themeId === THEME_ID &&
    !p.hasCartDrawer &&
    !p.has7DayLabel &&
    !p.hasTrialSection &&
    p.hasProceed &&
    p.cards.every((c) => c.index !== '1') &&
    p.cards.length >= 3
  ) {
    console.log('\nSUCCESS — New changes features live without trial/cart')
    process.exit(0)
  }
}

console.log('\nPublished but storefront probe not fully clean yet — hard refresh may be needed')
process.exit(0)
