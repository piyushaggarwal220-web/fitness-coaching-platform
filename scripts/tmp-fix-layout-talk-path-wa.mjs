import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('i want a free consultation call and more info')

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}

let layout = await get('layout/theme.liquid')

const NEW_REDIRECT = `{%- comment -%} lurvox-talk-path-redirect-v2 {%- endcomment -%}
<script>
  (function () {
    try {
      var path = (window.location.pathname || '').replace(/\\/+$/, '');
      if (path === '/pages/talk-coach' || path === '/pages/talk-to-a-coach' || path === '/pages/talk-coach-consult') {
        window.location.replace(${JSON.stringify(WA)});
      }
    } catch (e) {}
  })();
</script>
{%- comment -%} /lurvox-talk-path-redirect-v2 {%- endcomment -%}
`

layout = layout.replace(
  /\{%-?\s*comment\s*-?%\}\s*lurvox-talk-path-redirect-v1[\s\S]*?\/lurvox-talk-path-redirect-v1[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
  NEW_REDIRECT
)
layout = layout.replace(
  /\{%-?\s*comment\s*-?%\}\s*lurvox-talk-path-redirect-v2[\s\S]*?\/lurvox-talk-path-redirect-v2[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
  NEW_REDIRECT
)

if (!layout.includes('lurvox-talk-path-redirect-v2')) {
  layout = layout.replace('</head>', NEW_REDIRECT + '\n</head>')
}

const gql = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($themeId:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
      themeFilesUpsert(themeId:$themeId,files:$files){
        upsertedThemeFiles{filename} userErrors{message}
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL', JSON.stringify(gql.data?.themeFilesUpsert || gql.errors))

await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
})

const saved = await get('layout/theme.liquid')
console.log('has v2', saved.includes('lurvox-talk-path-redirect-v2'))
console.log('has WA in path redirect', saved.includes('free%20consultation') || saved.includes(WA))

// Check fresh render
const view = await fetch('https://www.lurvox.in/?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
console.log('view has v2', view.includes('lurvox-talk-path-redirect-v2'))
console.log('view has layout wa force', view.includes('lurvox-layout-talk-wa-v1'))

const talk = await fetch('https://www.lurvox.in/pages/talk-coach?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
console.log('talk?view= stamp', talk.includes('lurvox-talk-wa-redirect'))
console.log('talk?view= path v2', talk.includes('lurvox-talk-path-redirect-v2'))
