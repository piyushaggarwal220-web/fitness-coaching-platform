/**
 * Deploy form-based Talk-to-coach CTAs + mobile polish to MAIN.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME = 161429127419
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await res.text()
  if (!text?.trim()) return null
  try {
    return JSON.parse(text).asset?.value ?? null
  } catch {
    return null
  }
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 400)}`)
  console.log('updated', key)
}

const files = [
  ['snippets/lurvox-conversion-boost.liquid', 'snippets-lurvox-conversion-boost.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'snippets-lurvox-sales-closer.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'sections-lurvox-ad-landing.liquid'],
  ['sections/lurvox-talk-to-coach.liquid', 'sections-lurvox-talk-to-coach.liquid'],
  ['templates/page.talk-to-a-coach.json', 'templates-page.talk-to-a-coach.json'],
]

for (const [key, local] of files) {
  const value = fs.readFileSync(path.join(__dirname, 'shopify-assets', local), 'utf8')
  if (key.includes('conversion') && value.includes('wa.me')) {
    throw new Error('conversion boost still has wa.me')
  }
  await putAsset(key, value)
}

let hero = await getAsset('blocks/ai_gen_block_52353f6.liquid')
if (hero) {
  const next = hero
    .replace(
      /href="https:\/\/wa\.me\/919220451577[^"]*"[^>]*>\s*Talk to a coach\s*</g,
      'href="/pages/talk-to-a-coach">Talk to a coach<'
    )
    .replace(
      /href="https:\/\/wa\.me\/919220451577[^"]*"[^>]*>\s*WhatsApp a coach\s*</g,
      'href="/pages/talk-to-a-coach">Talk to a coach<'
    )
  if (next !== hero) {
    await putAsset('blocks/ai_gen_block_52353f6.liquid', next)
  } else {
    console.log('hero CTA already form-linked or pattern missing')
  }
}

const pages = await gql(`{ pages(first: 50) { nodes { id handle templateSuffix title } } }`)
const talk = pages.pages.nodes.find((p) => p.handle === 'talk-to-a-coach')
if (!talk) throw new Error('talk-to-a-coach page missing')
const updated = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { handle templateSuffix }
      userErrors { message }
    }
  }`,
  {
    id: talk.id,
    page: {
      templateSuffix: 'talk-to-a-coach',
      isPublished: true,
      title: 'Book a free consultation call',
    },
  }
)
console.log(updated.pageUpdate)

const html = await (
  await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`)
).text()
console.log({
  formUrl: 'https://www.lurvox.in/pages/talk-to-a-coach',
  hasLxConsult: html.includes('lx-consult'),
  hasApi: html.includes('api/public/talk-to-a-coach'),
})
