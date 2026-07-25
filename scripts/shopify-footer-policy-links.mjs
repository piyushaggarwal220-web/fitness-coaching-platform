/**
 * Add Razorpay policy links into the live theme footer without menu API scope.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

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

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
const fileData = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id, filenames: ['sections/footer-group.json'] }
)

const raw = fileData.theme.files.nodes[0]?.body?.content
if (!raw) throw new Error('footer-group.json missing')
fs.writeFileSync('scripts/tmp-footer-group-before.json', raw)

const footer = JSON.parse(stripAutoHeader(raw))

const linksHtml =
  '<p>' +
  [
    ['Privacy Policy', '/pages/privacy-policy'],
    ['Terms', '/pages/terms-and-conditions'],
    ['Refunds', '/pages/refund-and-cancellation-policy'],
    ['Shipping', '/pages/shipping-policy'],
    ['Pricing', '/pages/pricing'],
    ['About', '/pages/about-us'],
    ['Contact', '/pages/contact'],
  ]
    .map(([label, href]) => `<a href="${href}">${label}</a>`)
    .join(' · ') +
  '</p>'

let patched = false

// Prefer injecting into an existing text/html setting
outer: for (const section of Object.values(footer.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    const s = block.settings || {}
    for (const [key, val] of Object.entries(s)) {
      if (typeof val !== 'string') continue
      if (val.includes('/pages/privacy-policy')) {
        patched = true
        break outer
      }
      if (
        (key.includes('text') || key.includes('html') || key.includes('content') || key === 'text') &&
        val.length > 8
      ) {
        s[key] = `${val}${linksHtml}`
        patched = true
        console.log('Patched block', block.type, 'field', key)
        break outer
      }
    }
  }
}

// If no suitable field, add a custom-liquid / text block if the section supports it
if (!patched) {
  for (const [sectionId, section] of Object.entries(footer.sections || {})) {
    if (section.type !== 'footer' && section.type !== 'footer-group' && !String(section.type).includes('footer')) {
      continue
    }
    section.blocks = section.blocks || {}
    section.block_order = section.block_order || []
    const id = 'lurvox_policy_links'
    section.blocks[id] = {
      type: 'text',
      settings: {
        text: linksHtml,
        width: '100%',
      },
    }
    if (!section.block_order.includes(id)) section.block_order.push(id)
    patched = true
    console.log('Added text block to section', sectionId, section.type)
    break
  }
}

if (!patched) {
  // Last resort: attach under first section as custom liquid-like text settings dump
  const firstKey = Object.keys(footer.sections || {})[0]
  if (firstKey) {
    const section = footer.sections[firstKey]
    section.blocks = section.blocks || {}
    section.block_order = section.block_order || []
    const id = 'lurvox_policy_links'
    section.blocks[id] = {
      type: 'text',
      name: 'Policy links',
      settings: { text: linksHtml },
    }
    section.block_order.push(id)
    patched = true
    console.log('Added policy links to first section', firstKey)
  }
}

const next = JSON.stringify(footer, null, 2)
fs.writeFileSync('scripts/tmp-footer-group-after.json', next)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [{ filename: 'sections/footer-group.json', body: { type: 'TEXT', value: next } }],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log('Footer updated:', upsert.themeFilesUpsert.upsertedThemeFiles)
console.log('Patched:', patched)
