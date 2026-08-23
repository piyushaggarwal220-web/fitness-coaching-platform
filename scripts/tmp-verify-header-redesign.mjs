import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const draftId = 'gid://shopify/OnlineStoreTheme/161176977659'
const mainId = 'gid://shopify/OnlineStoreTheme/161112981755'

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

const q = `query ($id: ID!) {
  theme(id: $id) {
    name
    role
    files(filenames: [
      "sections/header-group.json",
      "sections/lurvox-header-redesign.liquid",
      "templates/index.json"
    ]) {
      nodes {
        filename
        body { ... on OnlineStoreThemeFileBodyText { content } }
      }
    }
  }
}`

function summarize(theme) {
  const files = {}
  for (const n of theme.theme.files.nodes) {
    const c = n.body?.content || ''
    files[n.filename] = {
      len: c.length,
      hasNewHeader: /lurvox-header-redesign|lx-hdr|data-lx-hdr/.test(c),
      hasOldHeaderSection: /"type": "header"|header_section/.test(c) && /logo_position/.test(c),
      hasOldClientLogin: /lurvox_client_login/.test(c),
      hasHomeRedesign: /lurvox-home-redesign/.test(c),
      hasOldHomeBlocks: /ai_gen_block_52353f6|blocks_C9E4qf/.test(c),
    }
  }
  return { name: theme.theme.name, role: theme.theme.role, files }
}

const draft = summarize(await gql(q, { id: draftId }))
const main = summarize(await gql(q, { id: mainId }))
const liveHtml = await (
  await fetch(`https://www.lurvox.in/?v=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()

const result = {
  draft,
  main,
  liveHasNewHeader: /data-lx-hdr|lx-hdr__wordmark/.test(liveHtml),
  liveHasOldLogin: /lurvox-client-login|Existing client\? Log in/.test(liveHtml),
  ok:
    draft.role === 'UNPUBLISHED' &&
    draft.files['sections/header-group.json']?.hasNewHeader &&
    draft.files['sections/lurvox-header-redesign.liquid']?.hasNewHeader &&
    draft.files['templates/index.json']?.hasOldHomeBlocks &&
    !draft.files['templates/index.json']?.hasHomeRedesign &&
    main.role === 'MAIN' &&
    !main.files['sections/header-group.json']?.hasNewHeader &&
    !/data-lx-hdr/.test(liveHtml),
  previewUrl: 'https://www.lurvox.in/?preview_theme_id=161176977659',
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exit(1)
