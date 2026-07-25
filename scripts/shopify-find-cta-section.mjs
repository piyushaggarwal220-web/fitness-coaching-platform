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

const data = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/index.json", "sections/mobile-floating-bar.liquid"], first: 10) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: draft.draftThemeId }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  const out = `C:/Users/DELL/coaching-platform/scripts/tmp-draft-${node.filename.replaceAll('/', '-')}`
  fs.writeFileSync(out, content)
  console.log('wrote', node.filename, content.length)
}

const index = data.theme.files.nodes.find((n) => n.filename === 'templates/index.json')?.body?.content || ''
const i = index.indexOf('START YOUR TRANSFORMATION')
console.log('cta context:', index.slice(Math.max(0, i - 500), i + 300).replace(/\s+/g, ' '))

// Find section type near cta_text
const sectionMatches = [...index.matchAll(/"type"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
console.log('section types sample', [...new Set(sectionMatches)].slice(0, 40))
