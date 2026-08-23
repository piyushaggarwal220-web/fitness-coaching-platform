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

async function restUpsert(key, value) {
  const res = await fetch(`${REST}/themes/${numericThemeId}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`${key}: ${await res.text()}`)
}

const data = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 10) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {
    id: themeId,
    filenames: [
      'layout/theme.liquid',
      'sections/footer-group.json',
      'sections/header-group.json',
      'sections/mobile-floating-bar.liquid',
    ],
  }
)

const files = Object.fromEntries(
  data.theme.files.nodes.map((n) => [n.filename, n.body?.content || ''])
)

// 1) Client-side redirect for cursed handle
const REDIR_START = '{%- comment -%} lurvox-talk-path-redirect-v1 {%- endcomment -%}'
const REDIR_END = '{%- comment -%} /lurvox-talk-path-redirect-v1 {%- endcomment -%}'
const redirSnippet = `${REDIR_START}
<script>
  (function () {
    try {
      var path = (window.location.pathname || '').replace(/\/+$/, '');
      if (path === '/pages/talk-to-a-coach') {
        window.location.replace('/pages/talk-coach' + window.location.search + window.location.hash);
      }
    } catch (e) {}
  })();
</script>
${REDIR_END}
`

let layout = files['layout/theme.liquid'] || ''
if (layout.includes(REDIR_START)) {
  layout = layout.replace(new RegExp(`${REDIR_START}[\\s\\S]*?${REDIR_END}`), redirSnippet)
} else {
  layout = layout.replace('</head>', `${redirSnippet}\n</head>`)
  if (!layout.includes(REDIR_START)) {
    layout = layout.replace('</body>', `${redirSnippet}\n</body>`)
  }
}
await restUpsert('layout/theme.liquid', layout)

// 2) Replace talk-to-a-coach URLs with talk-coach in common theme files
for (const [filename, content] of Object.entries(files)) {
  if (!content || filename === 'layout/theme.liquid') continue
  if (!content.includes('talk-to-a-coach')) continue
  const updated = content.replaceAll('/pages/talk-to-a-coach', '/pages/talk-coach')
  if (updated !== content) {
    await restUpsert(filename, updated)
    console.log('updated links in', filename)
  }
}

await new Promise((r) => setTimeout(r, 4000))

const html = await (await fetch('https://www.lurvox.in/pages/talk-to-a-coach?t=' + Date.now(), {
  redirect: 'follow',
})).text()
console.log({
  finalCheckForm: html.includes('lurvox-talk-coach__form'),
  hasRedirectScript: html.includes('lurvox-talk-path-redirect') || html.includes("path === '/pages/talk-to-a-coach'"),
  talkCoachOk: (await (await fetch('https://www.lurvox.in/pages/talk-coach?t=' + Date.now())).text()).includes(
    'lurvox-talk-coach__form'
  ),
})
