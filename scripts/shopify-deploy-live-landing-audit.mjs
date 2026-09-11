/**
 * Live landing-page audit fixes.
 * Writes only to theme 162252554491 (current MAIN). Does not publish another theme.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'scripts/shopify-assets')
const STORE = '9uwyq1-0j.myshopify.com'
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const THEME_ID = 162252554491
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
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

const token = tokenFile.access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function restGet(url) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } })
  if (!res.ok) throw new Error(`GET ${url} ${res.status} ${await res.text()}`)
  return res.json()
}

const themes = (await restGet(`https://${STORE}/admin/api/2025-01/themes.json`)).themes ?? []
const theme = themes.find((item) => item.id === THEME_ID)
if (!theme) throw new Error('Theme not found')
if (theme.name.trim() !== TARGET_NAME) throw new Error(`Unexpected name: ${theme.name}`)
if (theme.role !== 'main') throw new Error(`Refusing: theme role is ${theme.role}, expected main`)
console.log(`Updating live MAIN ${theme.id} ${theme.name}`)

const index = JSON.parse(
  (
    await restGet(
      `https://${STORE}/admin/api/2025-01/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`
    )
  ).asset.value
)

const gallery = index.sections?.lurvox_home_gallery?.blocks?.ai_gen_block_52353f6_MmHVRV?.settings
if (gallery) {
  gallery.headline_line_1 = 'Personal workout + diet from a real coach.'
  gallery.headline_line_2 = ''
  gallery.headline_highlight = 'See results in 90 days.'
}

const planBlock = index.sections?.home_blocks_v2?.blocks?.ai_gen_block_361650c_qqYKXh?.settings
if (planBlock) {
  planBlock.plan_2_link = 'https://app.lurvox.in/plans/3-months'
  planBlock.plan_3_link = 'https://app.lurvox.in/plans/6-months'
  planBlock.plan_4_link = 'https://app.lurvox.in/plans/12-months'
  planBlock.plan_2_footer = 'Best for: a focused 90-day fat-loss plan with a real coach'
  planBlock.plan_2_original_price = ''
  planBlock.plan_3_original_price = ''
  planBlock.plan_4_original_price = ''
}

let layout = (
  await restGet(
    `https://${STORE}/admin/api/2025-01/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`
  )
).asset?.value
const stamp = Date.now()
if (layout) {
  if (/<!-- lurvox-cache-bust \d+ -->/.test(layout)) {
    layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  } else {
    layout = layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)
  }
  layout = layout.replace(
    /<script src="https:\/\/cdn\.shopify\.com\/s\/files\/[^"]+lurvox-offer-overlay\.js\?v=\d+"><\/script>/,
    `<script src="{{ 'lurvox-offer-overlay.js' | asset_url }}" defer></script>`
  )
  if (!layout.includes('lurvox-storefront-cleanup')) {
    layout = layout.replace(
      '</head>',
      `<style id="lurvox-storefront-cleanup">
a[href="/account/login"],
a[href="/customer_authentication/login"],
.cart-drawer a[href*="/account"],
.cart-drawer__login,
#search-modal,
.search-modal { display: none !important; }
</style>
</head>`
    )
  }
}

const disk = (name) => fs.readFileSync(path.join(ASSETS, name), 'utf8')

const files = [
  { filename: 'blocks/ai_gen_block_361650c.liquid', body: { type: 'TEXT', value: disk('blocks-ai_gen_block_361650c.liquid') } },
  { filename: 'blocks/ai_gen_block_52353f6.liquid', body: { type: 'TEXT', value: disk('blocks-ai_gen_block_52353f6.liquid') } },
  { filename: 'blocks/footer-copyright.liquid', body: { type: 'TEXT', value: disk('blocks-footer-copyright.liquid') } },
  { filename: 'sections/lurvox-landing-hero.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-landing-hero.liquid') } },
  { filename: 'sections/lurvox-social-proof.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-social-proof.liquid') } },
  { filename: 'sections/lurvox-plan-finder-v3.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-plan-finder-v3.liquid') } },
  { filename: 'sections/lurvox-plan-finder.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-plan-finder.liquid') } },
  { filename: 'sections/lurvox-tap-plan-force.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-tap-plan-force.liquid') } },
  { filename: 'sections/lurvox-coach-footer.liquid', body: { type: 'TEXT', value: disk('sections-lurvox-coach-footer.liquid') } },
  { filename: 'sections/footer.liquid', body: { type: 'TEXT', value: disk('sections-footer.liquid') } },
  { filename: 'sections/footer-group.json', body: { type: 'TEXT', value: disk('sections-footer-group.json') } },
  { filename: 'snippets/lurvox-header-match.liquid', body: { type: 'TEXT', value: disk('snippets-lurvox-header-match.liquid') } },
  { filename: 'locales/en.default.json', body: { type: 'TEXT', value: disk('locales-en.default.json') } },
  { filename: 'assets/lurvox-offer-overlay.js', body: { type: 'TEXT', value: disk('lurvox-offer-overlay.js') } },
  { filename: 'templates/index.json', body: { type: 'TEXT', value: `${JSON.stringify(index, null, 2)}\n` } },
]
if (layout) {
  files.push({ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } })
}

const gql = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME_ID}`,
      files,
    },
  }),
})
const json = await gql.json()
if (json.errors?.length || json.data?.themeFilesUpsert?.userErrors?.length) {
  throw new Error(JSON.stringify(json, null, 2))
}
console.log(
  'Uploaded',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename).join(', ')
)

const productSearch = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `{
      products(first: 10, query: "title:'BUILD THE BODY' OR title:'90 DAYS'") {
        nodes { id title status publishedAt variants(first: 3) { nodes { price } } }
      }
    }`,
  }),
})
const products = await productSearch.json()
console.log('catalog', JSON.stringify(products.data?.products?.nodes ?? products, null, 2))
console.log('Live:', `https://www.lurvox.in/?v=${stamp}`)
