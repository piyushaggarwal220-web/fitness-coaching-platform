import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const main = themes.themes.find((theme) => theme.role === 'main')
console.log('main', main.id, main.name)

async function get(key) {
  const response = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const json = await response.json()
  return json.asset?.value ?? null
}

const block = await get('blocks/ai_gen_block_361650c.liquid')
const social = await get('sections/lurvox-social-proof.liquid')
const headerGroup = await get('sections/header-group.json')
const index = await get('templates/index.json')

const parsedHeader = headerGroup ? JSON.parse(headerGroup) : null
const parsedIndex = index ? JSON.parse(index) : null
let planSettings = null
for (const section of Object.values(parsedIndex?.sections ?? {})) {
  for (const b of Object.values(section.blocks ?? {})) {
    if (b.type === 'ai_gen_block_361650c') planSettings = b.settings
  }
}

console.log(
  JSON.stringify(
    {
      planBlock: {
        whiteOutline: /border:\s*2px solid #ffffff/i.test(block ?? ''),
        tapToPlan: (block ?? '').includes('goToPlan'),
        ctaButtonMarkup: (block ?? '').includes('data-cta-button'),
      },
      socialProofSection: {
        exists: Boolean(social),
        mentionsTrial: /7-Day Trial/i.test(social ?? ''),
      },
      headerGroup: {
        hasSocial: Boolean(parsedHeader?.sections?.lurvox_social_proof),
        order: parsedHeader?.order,
      },
      plans: {
        trialEnabled: planSettings?.plan_1_enabled,
        prices: [
          planSettings?.plan_2_price,
          planSettings?.plan_3_price,
          planSettings?.plan_4_price,
        ],
      },
    },
    null,
    2
  )
)

const preview = await (
  await fetch(
    `https://www.lurvox.in/?preview_theme_id=${main.id}&pv=${Date.now()}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile' } }
  )
).text()
console.log('preview render', {
  themeId: preview.match(/"id":(\d+),"schema_name"/)?.[1] ?? null,
  social: /lurvox-social-proof/.test(preview),
  whiteOutline: /border:\s*2px solid #ffffff/i.test(preview),
})
