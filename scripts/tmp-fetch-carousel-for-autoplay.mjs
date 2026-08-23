/**
 * Fetch live photo-testimonial carousel blocks for autoplay patching.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'tmp-live-theme-meta.json'), 'utf8'))

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

for (const n of data.theme.files.nodes) {
  const c = n.body?.content ?? ''
  const short = n.filename.replace('blocks/', '').replace('.liquid', '')
  fs.writeFileSync(path.join(outDir, `tmp-live-${short}.liquid`), c)
  console.log(n.filename, {
    bytes: c.length,
    hasAutoplay: /setInterval|autoplay|autoScroll|auto-scroll/.test(c),
    ranges: [...c.matchAll(/\(1\.\.(\d+)\)/g)].map((m) => m[0]),
    imagePickers: (c.match(/"id":\s*"image_\d+"/g) || []).length,
    screenshots: (c.match(/"id":\s*"screenshot_\d+"/g) || []).length,
    transforms: (c.match(/"id":\s*"transformation_image_\d+"/g) || []).length,
  })
}
console.log('fetched', data.theme.files.nodes.length, 'files from', live.name)
