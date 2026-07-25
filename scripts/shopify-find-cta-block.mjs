import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const draft = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-draft-theme.json', 'utf8')
)
const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`

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
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const index = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-draft-templates-index.json',
  'utf8'
)
const idx = index.indexOf('"cta_text"')
// walk backward to find type
const before = index.slice(Math.max(0, idx - 2500), idx)
const typeMatches = [...before.matchAll(/"type"\s*:\s*"([^"]+)"/g)]
console.log('nearest types before cta_text:', typeMatches.slice(-8).map((m) => m[1]))

const candidates = typeMatches.slice(-5).map((m) => m[1]).filter((t) => t.startsWith('ai_gen'))
console.log('candidates', candidates)

const filenames = candidates.map((t) => `blocks/${t}.liquid`)
const data = await gql(
  `query($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      files(filenames: $names, first: 20) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: draft.draftThemeId, names: filenames }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  console.log('\n====', node.filename, content.length)
  // find class names and cta button markup
  const classHits = [...content.matchAll(/class=["']([^"']+)["']/g)].map((m) => m[1]).slice(0, 40)
  console.log('classes', classHits)
  const ctaIdx = content.toLowerCase().indexOf('cta')
  console.log(content.slice(Math.max(0, ctaIdx - 200), ctaIdx + 600))
}
