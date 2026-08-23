/**
 * Apply conversion improvements to draft theme only:
 * "Copy of Offer live 2026-08-05 19:59" (id 161429127419)
 *
 * - Hero CTAs (Start + WhatsApp)
 * - Trust strip + How it works before plans
 * - Moat block moved above pricing
 * - India outcome plan copy
 * - Bottom CTAs + FAB → softer entry
 * - Main menu Catalog → Plans
 *
 * NEVER publishes. Preview:
 * https://www.lurvox.in/?preview_theme_id=161429127419
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME_ID = 161429127419
const THEME_NAME = 'Copy of Offer live 2026-08-05 19:59'
const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('Hi LURVOX — I want a free consult before choosing a plan.')

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const draftDir = path.join(__dirname, 'tmp-offer-copy-draft')
const snippetPath = path.join(__dirname, 'shopify-assets', 'snippets-lurvox-conversion-boost.liquid')
const heroPath = path.join(draftDir, 'blocks__ai_gen_block_52353f6.liquid')
const indexPath = path.join(draftDir, 'templates__index.json')
const footerPath = path.join(draftDir, 'sections__footer-group.json')

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

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

// Confirm draft theme
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const theme = themes.find((t) => t.id === THEME_ID)
if (!theme) throw new Error(`Theme ${THEME_ID} not found`)
if (theme.role === 'main') throw new Error('Refusing to write to MAIN theme')
if (!String(theme.name).includes('Copy of Offer live')) {
  throw new Error(`Unexpected theme name: ${theme.name}`)
}
console.log('target', theme.id, theme.name, theme.role)

// Fresh index + footer from draft
const indexRaw = await getAsset('templates/index.json')
const footerRaw = await getAsset('sections/footer-group.json')
if (!indexRaw || !footerRaw) throw new Error('Missing index or footer-group on draft')
const index = JSON.parse(indexRaw)
const footer = JSON.parse(footerRaw)
fs.writeFileSync(indexPath, indexRaw)
fs.writeFileSync(footerPath, footerRaw)

const home = index.sections.home_blocks_v2
if (!home?.blocks) throw new Error('home_blocks_v2 missing')

const plan = home.blocks.ai_gen_block_361650c_qqYKXh
if (!plan) throw new Error('plan block missing')

// 1) Plan copy — India outcomes
Object.assign(plan.settings, {
  headline: 'Pick the plan that matches your goal',
  subheadline:
    'Veg / ghar-ka-khana friendly · Gym or home · Personal coach — not a PDF · WELCOME60 = 60% off',
  plan_2_description: 'Office belly & consistency reset',
  plan_2_footer:
    'Build the habit in 90 days. Ghar-ka-khana friendly. Gym or home. Start from ≈ ₹19/day.',
  plan_3_description: 'Visible change that actually sticks',
  plan_3_footer:
    'Fat down, muscle up — weekly coach reviews so progress doesn’t stall. Best balance of price vs results.',
  plan_4_description: 'Full lifestyle transformation',
  plan_4_footer:
    'Lowest monthly rate + Crazy League prize money up to ₹5,000. For people going all-in.',
  cta_text: 'START',
  trust_stat: '7,000+ transformations · Pay via UPI / Razorpay',
})

// 2) FAQ — trust / risk reversal
const faq = home.blocks.ai_gen_block_66d8696_yVRepa
if (faq?.settings) {
  faq.settings.answer_1 =
    'You create your account, finish a short assessment with progress photos, and get a personal workout + diet within 24–48 hours. Pay securely with UPI / cards on Razorpay. Then use daily trackers, message your coach, submit weekly check-ins, and get plan updates from real progress.'
  faq.settings.question_6 = 'IS THERE A RISK IF IT’S NOT FOR ME?'
  faq.settings.answer_6 =
    'Message us on WhatsApp anytime — we process cancellations without pressure games. Plans also adjust for busy weeks, travel, and missed sessions. Consistency over perfection.'
}

// 3) Bottom CTAs — don’t only push 12-month
for (const id of ['ai_gen_block_8d967d7_z6qqCf', 'ai_gen_block_8d967d7_hCLmVn']) {
  const block = home.blocks[id]
  if (!block?.settings) continue
  block.settings.button_text = 'START AT ₹566/MO'
  block.settings.button_link = 'https://app.lurvox.in/checkout?plan=3_months'
  if (id.endsWith('z6qqCf')) {
    block.settings.headline = 'Start with the 3-month Quick Reset.'
    block.settings.subheadline =
      'Or WhatsApp a coach first if you still have questions. Full coaching included — not a PDF.'
  } else {
    block.settings.headline = 'Ready when you are.'
    block.settings.subheadline =
      'Checkout → assessment + photos → personal plan in 24–48 hours. Prefer to talk first? Use WhatsApp.'
  }
}

// 4) Talk-to-coach block copy
const talk = home.blocks.ai_gen_block_19d52f6_xE8YAx
if (talk?.settings) {
  talk.settings.label = 'FREE · WHATSAPP OR FORM'
  talk.settings.title = 'Not sure yet? Talk to a coach'
  talk.settings.description =
    'Ask about veg diets, home workouts, or which plan fits you. Leave your details — or WhatsApp us for a faster reply.'
}

// 5) Insert conversion boost + move moat above plans
home.blocks.lurvox_conversion_boost = {
  type: 'custom-liquid',
  settings: {
    custom_liquid: "{% render 'lurvox-conversion-boost' %}",
  },
  blocks: {},
}

const desiredOrder = [
  'ai_gen_block_52353f6_MmHVRV', // hero
  'lurvox_conversion_boost', // trust + how it works
  'ai_gen_block_99f4724_BHNYiG', // moat (was near bottom)
  'ai_gen_block_3ba2481_yhYwEt',
  'ai_gen_block_361650c_qqYKXh', // plans
  'lurvox_plan_compare_inline',
  'ai_gen_block_973d4c3_fK8XWX',
  'divider_6UC8qa',
  'ai_gen_block_cd3c949_6mqWVi',
  'ai_gen_block_a7d1b3c_hM7X88',
  'ai_gen_block_6803fe6_BftXFL',
  'ai_gen_block_19d52f6_xE8YAx',
  'contact_form_ArpxEr',
  'divider_UNfcXQ',
  'ai_gen_block_66d8696_yVRepa',
  'ai_gen_block_8d967d7_z6qqCf',
  'logo_wRk98w',
  // keep remaining blocks that exist, excluding already listed + hide
]

const remaining = (home.block_order || []).filter((id) => !desiredOrder.includes(id))
home.block_order = [...desiredOrder, ...remaining]
console.log('block_order', home.block_order)

// 6) FAB → WhatsApp soft entry
const fabId = Object.keys(footer.sections || {}).find(
  (id) => footer.sections[id]?.type === 'mobile-floating-bar'
)
if (fabId) {
  footer.sections[fabId].settings = {
    ...footer.sections[fabId].settings,
    enabled: true,
    consultation_url: WA,
    consultation_label: 'WhatsApp a coach — free consult',
  }
  console.log('fab updated', fabId)
}

// Upload assets
const snippet = fs.readFileSync(snippetPath, 'utf8')
const hero = fs.readFileSync(heroPath, 'utf8')
if (!hero.includes('lurvox-hero-cta-v1')) {
  throw new Error('Hero block missing CTA patch')
}

await putAsset('snippets/lurvox-conversion-boost.liquid', snippet)
await putAsset('blocks/ai_gen_block_52353f6.liquid', hero)
await putAsset('templates/index.json', JSON.stringify(index, null, 2))
await putAsset('sections/footer-group.json', JSON.stringify(footer, null, 2))

// 7) Main menu: Catalog → Plans (store-level; affects all themes — only rename Catalog)
try {
  const menus = await gql(`{
    menus(first: 20) {
      nodes { id handle title items { id title url type resourceId items { id title url } } }
    }
  }`)
  const main = menus.menus.nodes.find((m) => m.handle === 'main-menu')
  if (main) {
    const mapItem = (item) => {
      let title = item.title
      let url = item.url
      if (/^catalog$/i.test(item.title)) {
        title = 'Plans'
        url = '/#plans'
      }
      return {
        title,
        url,
        type: item.type,
        resourceId: item.resourceId,
        items: (item.items || []).map(mapItem),
      }
    }
    const items = main.items.map(mapItem)
    const updated = await gql(
      `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`,
      { id: main.id, title: main.title, items }
    )
    const errs = updated.menuUpdate?.userErrors || []
    if (errs.length) {
      console.warn('menu update warnings', errs)
    } else {
      console.log('menu updated: Catalog → Plans')
    }
  } else {
    console.warn('main-menu not found; skip nav rename')
  }
} catch (err) {
  console.warn('menu update skipped:', err instanceof Error ? err.message : err)
}

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
fs.writeFileSync(footerPath, JSON.stringify(footer, null, 2))

console.log(
  JSON.stringify(
    {
      theme: THEME_NAME,
      themeId: THEME_ID,
      preview: `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`,
      published: false,
    },
    null,
    2
  )
)
