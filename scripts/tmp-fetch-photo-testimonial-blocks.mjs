import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(process.env.TEMP + '/shopify-auth-token.json', 'utf8')
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

// Resolve live (main) theme
const themes = await gql(`{
  themes(first: 20) {
    nodes { id name role }
  }
}`)
console.log('themes:', themes.themes.nodes.map((t) => `${t.role} ${t.name} ${t.id}`).join('\n'))

const live = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!live) throw new Error('No MAIN theme')
console.log('LIVE', live.id, live.name)

const names = [
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'sections/ai_gen_block_cd3c949.liquid',
  'sections/ai_gen_block_a7d1b3c.liquid',
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
  { id: live.id, names }
)

const outDir = 'C:/Users/DELL/coaching-platform/scripts'
for (const node of data.theme.files.nodes) {
  const content = node.body?.content ?? ''
  console.log('FILE', node.filename, 'size', node.size, 'len', content.length)
  const safe = node.filename.replaceAll('/', '-')
  fs.writeFileSync(`${outDir}/tmp-${safe}`, content)

  // Find schema limits / loops related to photos
  const schemaMatch = content.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/)
  if (schemaMatch) {
    try {
      const schema = JSON.parse(schemaMatch[1])
      const settings = schema.settings || []
      const imageSettings = settings.filter(
        (s) =>
          /image|screenshot|photo|testimonial|transformation|client/i.test(s.id || '') ||
          /image|screenshot|photo|testimonial/i.test(s.label || '')
      )
      console.log(
        '  image-like settings count:',
        imageSettings.length,
        imageSettings.map((s) => s.id).slice(0, 40)
      )
      const rangeSettings = settings.filter(
        (s) => s.type === 'range' || /max|limit|count|items/i.test(s.id || '')
      )
      console.log(
        '  range/limit settings:',
        rangeSettings.map((s) => ({ id: s.id, type: s.type, min: s.min, max: s.max, default: s.default }))
      )
    } catch (e) {
      console.log('  schema parse error', e.message)
    }
  }

  const loops = content.match(/\{%\s*for[\s\S]{0,120}?%\}/g) || []
  console.log('  for-loops:', loops.slice(0, 15))
  const nums = [...content.matchAll(/\b(1\.\.5|1 to 5|limit:\s*5|upto:\s*5|max_items|photo_count|slice:\s*5)\b/gi)]
  console.log('  limit-ish matches:', nums.map((m) => m[0]))
}

fs.writeFileSync(
  `${outDir}/tmp-live-theme-meta.json`,
  JSON.stringify({ id: live.id, name: live.name }, null, 2)
)
