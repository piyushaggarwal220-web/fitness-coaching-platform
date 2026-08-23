import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

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

const store = await gql(`{
  themes(first: 25) {
    nodes { id name role updatedAt }
  }
}`)
console.log(store.themes.nodes)

const live = await (await fetch(`https://www.lurvox.in/?t=${Date.now()}`)).text()
const markers = {
  mobileFix: live.includes('lurvox-mobile-talk-cta-v1'),
  talkHighlight: live.includes('lurvox-talk-cta-highlight'),
  talkOverride: live.includes('lurvox-talk-form-override'),
  homeRedesign: live.includes('lurvox-home-redesign'),
}

console.log('live home markers', markers)

for (const theme of store.themes.nodes.filter((t) => t.role === 'MAIN' || t.role === 'UNPUBLISHED')) {
  const files = await gql(
    `query ($id: ID!) {
      theme(id: $id) {
        files(filenames: ["layout/theme.liquid"], first: 1) {
          nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: theme.id }
  )
  const content = files.theme.files.nodes[0]?.body?.content || ''
  console.log(theme.role, theme.name, theme.id.split('/').pop(), {
    mobileFix: content.includes('lurvox-mobile-talk-cta-v1'),
    talkHighlight: content.includes('lurvox-talk-cta-highlight'),
    talkOverride: content.includes('lurvox-talk-form-override'),
    len: content.length,
  })
}
