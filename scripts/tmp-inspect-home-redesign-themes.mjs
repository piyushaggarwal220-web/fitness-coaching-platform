import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const draftId = 'gid://shopify/OnlineStoreTheme/161176715515'
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

const query = `query ($id: ID!) {
  theme(id: $id) {
    name
    role
    files(filenames: ["templates/index.json", "sections/lurvox-home-redesign.liquid"]) {
      nodes {
        filename
        body { ... on OnlineStoreThemeFileBodyText { content } }
      }
    }
  }
}`

function summarize(theme) {
  const out = { name: theme.theme.name, role: theme.theme.role, files: {} }
  for (const n of theme.theme.files.nodes) {
    const c = n.body?.content || ''
    out.files[n.filename] = {
      len: c.length,
      hasLxHome: /lurvox-home-redesign|data-lx-home|lx-home__brand/.test(c),
      hasOldBlocks: /ai_gen_block_52353f6|blocks_C9E4qf/.test(c),
      head: c.slice(0, 160).replace(/\s+/g, ' '),
    }
  }
  return out
}

const draft = await gql(query, { id: draftId })
const main = await gql(query, { id: mainId })
console.log(JSON.stringify({ draft: summarize(draft), main: summarize(main) }, null, 2))
