import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
)
const live = JSON.parse(
  fs.readFileSync('C:/Users/DELL/coaching-platform/scripts/tmp-live-theme-meta.json', 'utf8')
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
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_a6b1d06.liquid',
  'blocks/ai_gen_block_d835842.liquid',
  'blocks/ai_gen_block_3cbb200.liquid',
]

const data = await gql(
  `query($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      files(filenames: $names, first: 10) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: live.id, names }
)

const outDir = 'C:/Users/DELL/coaching-platform/scripts'
for (const node of data.theme.files.nodes) {
  const c = node.body?.content ?? ''
  fs.writeFileSync(`${outDir}/tmp-${node.filename.replaceAll('/', '-')}`, c)
  const nameMatch = c.match(/"name":\s*"([^"]+)"/)
  const docMatch = c.match(/\{%\s*doc\s*%\}([\s\S]{0,400})/)
  console.log('\n====', node.filename)
  console.log('schema name:', nameMatch?.[1])
  console.log('doc start:', docMatch?.[1]?.replace(/\s+/g, ' ').slice(0, 200))
  console.log('ranges:', [...c.matchAll(/\(1\.\.(\d+)\)/g)].map((m) => m[0]))
  console.log(
    'image settings:',
    [...c.matchAll(/"id":\s*"(image[^"]*|photo[^"]*|screenshot[^"]*|transformation[^"]*|client[^"]*)"/gi)].map(
      (m) => m[1]
    )
  )
}
