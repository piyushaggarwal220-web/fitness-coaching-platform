import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
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
      files(filenames: ["sections/mobile-floating-bar.liquid"], first: 1) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId }
)

let liquid = data.theme.files.nodes[0]?.body?.content || ''
liquid = liquid.replace(/\n<script>\n\/\* lurvox-talk-path-redirect-v1 \*\/[\s\S]*?<\/script>\n?/g, '')

const redirectScript = `
<script>
/* lurvox-talk-path-redirect-v1 */
(function () {
  try {
    var path = window.location.pathname || '';
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '/pages/talk-to-a-coach') {
      window.location.replace('/pages/talk-coach' + window.location.search + window.location.hash);
    }
  } catch (e) {}
})();
</script>
`

liquid += redirectScript

const put = await fetch(`${REST}/themes/${numericThemeId}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({ asset: { key: 'sections/mobile-floating-bar.liquid', value: liquid } }),
})
console.log('fab put', put.status, await put.text().then((t) => t.slice(0, 120)))

await new Promise((r) => setTimeout(r, 4000))
const home = await (await fetch('https://www.lurvox.in/?t=' + Date.now())).text()
console.log({
  homeHasTalkCoachLink: home.includes('/pages/talk-coach'),
  homeHasOldLink: (home.match(/\/pages\/talk-to-a-coach/g) || []).length,
  homeHasRedirect: home.includes('lurvox-talk-path-redirect-v1'),
})
