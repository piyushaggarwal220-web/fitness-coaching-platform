/**
 * Make homepage plan card goal labels stronger; duration stays secondary.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME = 161454620923
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

let block = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'),
  'utf8'
)
block = block.replace(
  /\.ai-transformation-plan-card-label-\{\{ ai_gen_id \}\} \{[\s\S]*?\}/,
  `.ai-transformation-plan-card-label-{{ ai_gen_id }} {
    font-size: 18px;
    font-weight: 850;
    letter-spacing: -0.02em;
    color: {{ block.settings.primary_text_color }};
    line-height: 1.2;
  }`
)
block = block.replace(
  /\.ai-transformation-plan-card-duration-\{\{ ai_gen_id \}\} \{[\s\S]*?\}/,
  `.ai-transformation-plan-card-duration-{{ ai_gen_id }} {
    font-size: 12px;
    color: {{ block.settings.secondary_text_color }};
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.78;
    margin-top: 2px;
  }`
)
fs.writeFileSync(
  path.join(ROOT, 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'),
  block
)

const index = JSON.parse(await get('templates/index.json'))
const s = index.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh.settings
s.plan_2_label = 'Fat loss'
s.plan_2_duration = '90 DAYS'
s.plan_3_label = 'Fat loss + muscle'
s.plan_3_duration = '6 MONTHS'
s.plan_4_label = 'Aesthetic body'
s.plan_4_duration = '12 MONTHS'
s.headline = 'Pick your goal. Duration comes second.'

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
  layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
} else {
  layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const files = [
  {
    filename: 'blocks/ai_gen_block_361650c.liquid',
    body: { type: 'TEXT', value: block },
  },
  {
    filename: 'templates/index.json',
    body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` },
  },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

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
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${THEME}`, files },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors))
}
console.log('ok', `https://www.lurvox.in/?v=goalcards${stamp}#plans`)
