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

// Fetch all ai_gen block filenames, then search those containing screenshot_/transformation_image_/(1..N)
const list = await gql(
  `query($id: ID!) {
    theme(id: $id) {
      files(filenames: [], first: 250) {
        nodes { filename }
      }
    }
  }`,
  { id: live.id }
)

const candidates = list.theme.files.nodes
  .map((n) => n.filename)
  .filter((f) => f.startsWith('blocks/ai_gen_block_') && f.endsWith('.liquid'))

console.log('ai_gen blocks:', candidates.length)

// Batch fetch in chunks of 10 and find (1..N) and screenshot_/transformation
const hits = []
for (let i = 0; i < candidates.length; i += 10) {
  const chunk = candidates.slice(i, i + 10)
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
    { id: live.id, names: chunk }
  )
  for (const node of data.theme.files.nodes) {
    const c = node.body?.content ?? ''
    const ranges = [...c.matchAll(/\(1\.\.(\d+)\)/g)].map((m) => Number(m[1]))
    const hasScreenshots = /screenshot_\d/.test(c)
    const hasTransforms = /transformation_image_\d/.test(c)
    const hasPhotoTestimonial =
      /member.?wins|client.?results|testimonial|transformation|screenshot/i.test(c)
    if (hasScreenshots || hasTransforms || ranges.length || hasPhotoTestimonial) {
      const screenshotCount = (c.match(/"id":\s*"screenshot_\d+"/g) || []).length
      const transformCount = (c.match(/"id":\s*"transformation_image_\d+"/g) || []).length
      hits.push({
        file: node.filename,
        ranges,
        screenshotCount,
        transformCount,
        hasScreenshots,
        hasTransforms,
      })
    }
  }
}

console.log(JSON.stringify(hits, null, 2))
fs.writeFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-photo-testimonial-scan.json',
  JSON.stringify(hits, null, 2)
)
