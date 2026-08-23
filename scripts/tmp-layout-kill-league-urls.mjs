import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(`${process.env.TEMP}/shopify-auth-token.json`, 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = 161454620923

const get = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await get.json()).asset.value

const START = '{%- comment -%} lx-no-league-urls {%- endcomment -%}'
const END = '{%- comment -%} /lx-no-league-urls {%- endcomment -%}'
const snippet = `${START}
{%- assign lx_path = request.path | downcase -%}
{%- if lx_path contains '/pages/consistency-league' or lx_path contains '/pages/league' -%}
  <script>window.location.replace('/');</script>
{%- endif -%}
${END}`

if (layout.includes(START)) {
  layout = layout.replace(new RegExp(`${START}[\\s\\S]*?${END}`), snippet)
} else if (layout.includes('<head>')) {
  layout = layout.replace('<head>', `<head>\n${snippet}`)
} else {
  layout = snippet + layout
}

const stamp = Date.now()
layout = layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)

const upsert = await fetch(GQL, {
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
      themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }],
    },
  }),
})
console.log(JSON.stringify((await upsert.json()).data?.themeFilesUpsert, null, 2))
console.log('stamp', stamp)
