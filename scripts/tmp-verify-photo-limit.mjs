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
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
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

for (const node of data.theme.files.nodes) {
  const c = node.body?.content ?? ''
  const imagePickers = (c.match(/"id":\s*"image_\d+"/g) || []).length
  const screenshots = (c.match(/"id":\s*"screenshot_\d+"/g) || []).length
  const transforms = (c.match(/"id":\s*"transformation_image_\d+"/g) || []).length
  console.log(node.filename, {
    ranges: [...c.matchAll(/\(1\.\.(\d+)\)/g)].map((m) => m[0]),
    imagePickers,
    screenshots,
    transforms,
    dynamicSlides: c.includes("querySelectorAll('[data-slide]')"),
    scrollableThumbs: c.includes('overflow-x: auto'),
  })
}
