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
  'assets/results-list.js',
  'blocks/review.liquid',
  'blocks/_carousel-content.liquid',
  'blocks/ai_gen_block_19d52f6.liquid', // nearby on homepage after testimonials
]

const data = await gql(
  `query($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      files(filenames: $names, first: 20) {
        nodes {
          filename
          size
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: live.id, names }
)

const outDir = 'C:/Users/DELL/coaching-platform/scripts'
for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  console.log('\n====', node.filename, 'len', content.length)
  fs.writeFileSync(`${outDir}/tmp-${node.filename.replaceAll('/', '-')}`, content)
  const loops = content.match(/\{%\s*for[\s\S]{0,80}?%\}/g) || []
  console.log('for-loops:', loops)
  const ranges = [...content.matchAll(/\(1\.\.(\d+)\)/g)].map((m) => m[0])
  console.log('1..N ranges:', ranges)
  const maxBlocks = content.match(/"max_blocks"\s*:\s*\d+/g)
  console.log('max_blocks:', maxBlocks)
  const limit5 = [...content.matchAll(/limit\s*[:=]\s*5|max.{0,20}5|slice\([^)]*5|take\s*\(\s*5/gi)]
  console.log('limit5-ish:', limit5.map((m) => m[0]).slice(0, 20))
}

// Also search index for any max_items / photo_count settings
const indexData = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/index.json"], first: 1) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: live.id }
)
const indexContent = indexData.theme.files.nodes[0]?.body?.content ?? ''
fs.writeFileSync(`${outDir}/tmp-live-index-now.json`, indexContent)
const hits = [...indexContent.matchAll(/max_items|photo_count|screenshot_|transformation_image_|items_to_show|visible_items|number_of/gi)]
console.log('\nindex setting hits:', [...new Set(hits.map((h) => h[0]))])

// Find blocks with (1..5) by fetching a batch of ai_gen blocks that might be photo related
// Search within known homepage blocks from index
const homepageBlocks = [
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'blocks/ai_gen_block_19d52f6.liquid',
  'blocks/ai_gen_block_973d4c3.liquid',
]
