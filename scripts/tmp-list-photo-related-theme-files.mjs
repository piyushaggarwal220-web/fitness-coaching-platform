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

// List theme files that might be photo/testimonial related
const data = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: [], first: 250) {
        nodes { filename size }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`,
  { id: live.id }
)

const files = data.theme.files.nodes
  .map((n) => n.filename)
  .filter((f) =>
    /ai_gen|testimonial|transform|photo|carousel|screenshot|review|result/i.test(f)
  )
console.log(files.join('\n'))
