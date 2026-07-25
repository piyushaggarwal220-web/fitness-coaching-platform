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

const names = [
  'blocks/ai_gen_block_361650c.liquid',
  'sections/ai_gen_block_361650c.liquid',
]

const data = await gql(
  `query($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      files(filenames: $names, first: 10) {
        nodes {
          filename
          size
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: draft.draftThemeId, names }
)

for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  console.log('FILE', node.filename, 'size', node.size, 'len', content.length)
  fs.writeFileSync(
    `C:/Users/DELL/coaching-platform/scripts/tmp-cta-${node.filename.replaceAll('/', '-')}`,
    content
  )
  // Extract relevant class names around cta
  const matches = content.match(/class="[^"]*cta[^"]*"/gi) || []
  console.log('cta classes', matches)
  const matches2 = content.match(/ai-gen[^"'\s]*/gi) || []
  console.log('ai-gen tokens', [...new Set(matches2)].slice(0, 20))
  const btn = content.match(/cta_text[\s\S]{0,400}/)
  console.log(btn?.[0]?.slice(0, 500))
}
