import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
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

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
console.log('MAIN', main.name, main.id)

// Read current header-group via REST for content
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headerRes = await fetch(
  `${REST}/themes/${main.id.split('/').pop()}/assets.json?asset[key]=sections/header-group.json&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const headerValue = (await headerRes.json()).asset.value
const header = JSON.parse(headerValue)
console.log('header order before upsert:', header.order)
console.log('has hide?', Boolean(header.sections.lurvox_hide_1month))

// Ensure clean + add a unique setting bump via a comment in a section that exists
// We'll upsert a cleaned header-group AND a tiny CSS-only hide section file back
// (empty preset) so any residual reference renders nothing harmful.

const cleanHeader = JSON.parse(JSON.stringify(header))
delete cleanHeader.sections.lurvox_hide_1month
if (Array.isArray(cleanHeader.order)) {
  cleanHeader.order = cleanHeader.order.filter((k) => k !== 'lurvox_hide_1month')
}

const hideSectionLiquid = `{% comment %} lurvox-hide-allow-trial-v4 {% endcomment %}
{% comment %} Intentionally empty — legacy 1-month plan is gone. Trial is plan_1. {% endcomment %}
{% schema %}
{
  "name": "LURVOX hide 1-month",
  "settings": [],
  "presets": [{ "name": "LURVOX hide 1-month" }]
}
{% endschema %}
`

const stamp = Date.now()
let layoutRes = await fetch(
  `${REST}/themes/${main.id.split('/').pop()}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let layout = (await layoutRes.json()).asset.value
layout = layout.replace(
  /<!-- lurvox-cache-bust \d+ -->/,
  `<!-- lurvox-cache-bust ${stamp} -->`
)
if (!layout.includes('lurvox-cache-bust')) {
  layout = layout.replace('</head>', `  <!-- lurvox-cache-bust ${stamp} -->\n</head>`)
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [
      {
        filename: 'sections/header-group.json',
        body: { type: 'TEXT', value: JSON.stringify(cleanHeader, null, 2) },
      },
      {
        filename: 'sections/lurvox-hide-1month.liquid',
        body: { type: 'TEXT', value: hideSectionLiquid },
      },
      {
        filename: 'layout/theme.liquid',
        body: { type: 'TEXT', value: layout },
      },
    ],
  }
)
console.log('upsert result', JSON.stringify(upsert, null, 2))

function probe(html) {
  return {
    stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('lurvox_hide_1month'),
    emptyMarker: html.includes('lurvox-hide-allow-trial-v4'),
  }
}

console.log('\nPolling / ...')
for (let i = 0; i < 18; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const p = probe(html)
  console.log(i, p)
  if (!p.showTrialPlan) {
    console.log('\nSUCCESS')
    process.exit(0)
  }
}
process.exit(1)
