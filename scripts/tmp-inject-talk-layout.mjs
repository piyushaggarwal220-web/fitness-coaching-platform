import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const themeId = 'gid://shopify/OnlineStoreTheme/161112981755'
const numericThemeId = '161112981755'

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const data = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["layout/theme.liquid"], first: 1) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId }
)

let layout = data.theme.files.nodes[0]?.body?.content || ''
if (!layout) throw new Error('layout missing')

const MARKER_START = '{%- comment -%} lurvox-talk-form-override-v1 {%- endcomment -%}'
const MARKER_END = '{%- comment -%} /lurvox-talk-form-override-v1 {%- endcomment -%}'

const snippet = `${MARKER_START}
{% if request.page_type == 'page' and page.handle == 'talk-to-a-coach' %}
<style>
  #MainContent .shopify-section { display: none !important; }
  #lurvox-talk-override { display: block; }
</style>
<div id="lurvox-talk-override">
  {% section 'lurvox-talk-to-coach' %}
</div>
{% endif %}
${MARKER_END}
`

if (layout.includes(MARKER_START)) {
  layout = layout.replace(
    new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
    snippet
  )
} else if (layout.includes('</body>')) {
  layout = layout.replace('</body>', `${snippet}\n</body>`)
} else {
  layout += `\n${snippet}\n`
}

const put = await fetch(`${REST}/themes/${numericThemeId}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})
if (!put.ok) throw new Error(await put.text())
console.log('layout updated', put.status)

await new Promise((r) => setTimeout(r, 4000))
const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?t=${Date.now()}`)).text()
console.log({
  hasOverride: html.includes('lurvox-talk-override'),
  hasForm: html.includes('lurvox-talk-coach__form'),
  hasApi: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
})
