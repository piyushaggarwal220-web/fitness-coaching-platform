/**
 * Deploy Orange theme: coaching prices ₹599 / ₹999 / ₹1,699 + 1-to-1 copy + marketing chat.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

const tokenFile = fs.existsSync(tokenPath)
  ? JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
  : null
if (!tokenFile?.refresh_token && !process.env.SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing Shopify token. Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}

if (tokenFile?.refresh_token) {
  const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (refresh.ok) {
    Object.assign(tokenFile, JSON.parse(await refresh.text()))
    fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  }
}

const token = process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers: H })).json()).themes ?? []
const main = themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: H }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

function patchLiveJson(text) {
  return text
    .replace(/"plan_2_price": "\d+"/g, '"plan_2_price": "599"')
    .replace(/"plan_3_price": "\d+"/g, '"plan_3_price": "999"')
    .replace(/"plan_4_price": "\d+"/g, '"plan_4_price": "1699"')
    .replace(/"plan_2_monthly": "[^"]*"/g, '"plan_2_monthly": "≈ ₹200/month"')
    .replace(/"plan_3_monthly": "[^"]*"/g, '"plan_3_monthly": "≈ ₹167/month"')
    .replace(/"plan_4_monthly": "[^"]*"/g, '"plan_4_monthly": "≈ ₹142/month"')
    .replace(/"col_1_price": "₹[^"]*"/g, '"col_1_price": "₹599"')
    .replace(/"col_2_price": "₹[^"]*"/g, '"col_2_price": "₹999"')
    .replace(/"col_3_price": "₹[^"]*"/g, '"col_3_price": "₹1,699"')
    .replace(/"trust_coach": "[^"]*"/g, '"trust_coach": "1-to-1 online coaching"')
    .replace(
      /"wyg_1_body": "[^"]*"/g,
      '"wyg_1_body": "Instant account setup, onboarding assessment, and 1-to-1 coaching assigned to your case."'
    )
    .replace(/"faq_q_3": "[^"]*"/g, '"faq_q_3": "Is this real 1-to-1 coaching?"')
    .replace(
      /"faq_a_3": "[^"]*"/g,
      '"faq_a_3": "Yes. Your plan, check-ins, and progress are handled as your case — with personalised updates and chat support inside the app."'
    )
    .replace(
      /"subheadline": "Workout, diet, and a human coach on every plan\.[^"]*"/g,
      '"subheadline": "Workout, diet, and 1-to-1 coaching on every plan. Weekly phone call on 12 months only."'
    )
}

const repoFiles = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['sections/lurvox-plan-finder-v3.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder-v3.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-what-you-get.liquid', 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['snippets/lurvox-home-faq.liquid', 'scripts/shopify-assets/snippets-lurvox-home-faq.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
  ['snippets/lurvox-marketing-chat.liquid', 'scripts/shopify-assets/snippets-lurvox-marketing-chat.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'],
  ['sections/lurvox-hide-1month.liquid', 'scripts/shopify-assets/sections-lurvox-hide-1month.liquid'],
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['sections/lurvox-cart-builder.liquid', 'scripts/shopify-assets/sections-lurvox-cart-builder.liquid'],
  ['sections/lurvox-talk-to-coach.liquid', 'scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'],
  ['sections/lurvox-how-it-works.liquid', 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid'],
  ['sections/lurvox-offer-home.liquid', 'scripts/shopify-assets/sections-lurvox-offer-home.liquid'],
  ['sections/lurvox-home-redesign.liquid', 'scripts/shopify-assets/sections-lurvox-home-redesign.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'],
  ['templates/page.compare-plans.json', 'scripts/shopify-assets/templates-page.compare-plans.json'],
  ['templates/page.compare-short.json', 'scripts/shopify-assets/templates-page.compare-short.json'],
]

const themeOnly = [
  'templates/index.json',
  'templates/page.json',
  'templates/page.compare-detail.json',
]

const files = []
for (const [key, rel] of repoFiles) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    console.log('skip missing repo', rel)
    continue
  }
  files.push({ filename: key, body: { type: 'TEXT', value: read(rel) } })
}

for (const key of themeOnly) {
  const live = await get(key)
  if (!live) {
    console.log('skip missing', key)
    continue
  }
  const patched = patchLiveJson(live)
  if (patched !== live) {
    files.push({ filename: key, body: { type: 'TEXT', value: patched } })
    console.log('patched', key)
  } else {
    console.log('no change', key)
  }
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const CHAT_MARK = '<!-- lurvox-marketing-chat-v1 -->'
const CHAT_RENDER = "{% render 'lurvox-marketing-chat' %}"
if (!layout.includes(CHAT_MARK)) {
  if (layout.includes('</body>')) {
    layout = layout.replace(
      '</body>',
      `${CHAT_MARK}\n${CHAT_RENDER}\n</body>`
    )
  } else {
    layout += `\n${CHAT_MARK}\n${CHAT_RENDER}\n`
  }
  console.log('injected marketing chat into theme.liquid')
}

files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })

const res = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files,
    },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)
console.log('done — Orange prices ₹599 / ₹999 / ₹1,699 live')
