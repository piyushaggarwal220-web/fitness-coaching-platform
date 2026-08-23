/**
 * Sales optimisation pass on draft only:
 * Copy of Offer live 2026-08-05 19:59 (161429127419)
 *
 * - Multi-plan bottom closer (3/6/12) — no 12-month-only ask
 * - Align 90-day hook with 3-month primary
 * - Visible refund + results-guarantee risk reversal (real policy)
 * - Trust / payment badges
 * - FAQ + sticky copy updates
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161429127419
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const json = await res.json()
  return json.asset?.value ?? null
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(`${key}: ${JSON.stringify(json).slice(0, 500)}`)
  }
  console.log('updated', key)
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const theme = themes.find((t) => t.id === THEME_ID)
if (!theme || theme.role === 'main') throw new Error('Refuse: missing or MAIN theme')
console.log('target', theme.id, theme.name)

const boost = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
const closer = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-sales-closer.liquid'),
  'utf8'
)

const index = JSON.parse(await getAsset('templates/index.json'))
const home = index.sections.home_blocks_v2
if (!home?.blocks) throw new Error('home_blocks_v2 missing')

// Plan section — reinforce 90-day alignment
const plan = home.blocks.ai_gen_block_361650c_qqYKXh
if (plan?.settings) {
  Object.assign(plan.settings, {
    headline: 'Pick your starting point',
    subheadline:
      'Aiming for 90 days? Start with Quick Reset. Want more change or prize money? Go 6 or 12. WELCOME60 = 60% off',
    plan_2_badge: '90-DAY FIT',
    trust_stat: '7,000+ transformations · UPI / Razorpay · Refund if plan late',
  })
}

// FAQ — refund + results guarantee (honest)
const faq = home.blocks.ai_gen_block_66d8696_yVRepa
if (faq?.settings) {
  faq.settings.question_6 = 'WHAT IF I WANT A REFUND?'
  faq.settings.answer_6 =
    'Cancellation anytime on WhatsApp — no pressure games. Full refund if onboarding is complete and we don’t deliver your first plan within 48 hours (request within 7 days of purchase). After plan delivery / coaching use, purchases are generally non-refundable. Separately, our results guarantee applies if you submit at least 90% of due check-ins on time and still report no result (admin-reviewed). Details: /pages/refund-policy and app.lurvox.in/refund-policy.'
}

// Bottom premium CTAs — stop exclusive 12-month push; send to multi-plan closer
for (const id of ['ai_gen_block_8d967d7_z6qqCf', 'ai_gen_block_8d967d7_hCLmVn']) {
  const block = home.blocks[id]
  if (!block?.settings) continue
  if (id.endsWith('z6qqCf')) {
    block.settings.headline = '90 days starts with one plan choice.'
    block.settings.subheadline =
      'Quick Reset (3 mo) matches the 90-day goal. 6 and 12 months are there when you want more runway — not because you must buy a year.'
  } else {
    block.settings.headline = 'Choose 3, 6, or 12 months — then start Day 1.'
    block.settings.subheadline =
      'Secure checkout via UPI / Razorpay. Personal plan in 24–48 hours. Refund path if delivery fails.'
  }
  block.settings.button_text = 'CHOOSE YOUR PLAN'
  block.settings.button_link = '#start'
}

// Talk block
const talk = home.blocks.ai_gen_block_19d52f6_xE8YAx
if (talk?.settings) {
  talk.settings.description =
    'Not sure 3 vs 6 vs 12? Ask about veg diets, home workouts, or refunds. Leave details — or WhatsApp for a faster reply.'
}

// Hero CTA label already in liquid; refresh gallery review line
const hero = home.blocks.ai_gen_block_52353f6_MmHVRV
if (hero?.settings) {
  hero.settings.review_text = '7,000+ VERIFIED · UPI / RAZORPAY · REFUND IF PLAN LATE'
}

// Insert / refresh sales closer before premium CTAs
home.blocks.lurvox_conversion_boost = {
  type: 'custom-liquid',
  settings: { custom_liquid: "{% render 'lurvox-conversion-boost' %}" },
  blocks: {},
}
home.blocks.lurvox_sales_closer = {
  type: 'custom-liquid',
  settings: { custom_liquid: "{% render 'lurvox-sales-closer' %}" },
  blocks: {},
}

const order = [...(home.block_order || [])].filter(
  (id) => id !== 'lurvox_sales_closer' && id !== 'lurvox_conversion_boost'
)
// Ensure boost after hero
const heroIdx = order.indexOf('ai_gen_block_52353f6_MmHVRV')
if (heroIdx >= 0) order.splice(heroIdx + 1, 0, 'lurvox_conversion_boost')
else order.unshift('lurvox_conversion_boost')

// Place closer just before first premium CTA (or before FAQ if missing)
const firstCta = order.indexOf('ai_gen_block_8d967d7_z6qqCf')
const faqIdx = order.indexOf('ai_gen_block_66d8696_yVRepa')
const insertAt = firstCta >= 0 ? firstCta : faqIdx >= 0 ? faqIdx + 1 : order.length
order.splice(insertAt, 0, 'lurvox_sales_closer')
home.block_order = order
console.log('block_order', home.block_order)

await putAsset('snippets/lurvox-conversion-boost.liquid', boost)
await putAsset('snippets/lurvox-sales-closer.liquid', closer)
await putAsset('templates/index.json', JSON.stringify(index, null, 2))

// Patch hero CTA primary label to "Start 90-day · ₹566/mo" if still old
let heroLiquid = await getAsset('blocks/ai_gen_block_52353f6.liquid')
if (heroLiquid?.includes('lurvox-hero-cta-v1')) {
  heroLiquid = heroLiquid.replace(/>Start at ₹566\/mo</g, '>Start 90-day · ₹566/mo<')
  if (heroLiquid.includes('Start 90-day')) {
    await putAsset('blocks/ai_gen_block_52353f6.liquid', heroLiquid)
  }
}

console.log(
  JSON.stringify(
    {
      themeId: THEME_ID,
      preview: `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`,
      published: false,
    },
    null,
    2
  )
)
