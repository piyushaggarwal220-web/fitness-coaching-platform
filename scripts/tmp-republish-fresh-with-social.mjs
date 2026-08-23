import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const response = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const themes = await gql('{ themes(first: 50) { nodes { id name role } } }')
const nodes = themes.themes.nodes
const main = nodes.find((theme) => theme.role === 'MAIN')
console.log('main', main)
console.log('theme count', nodes.length)

if (nodes.length >= 20) {
  const disposable = nodes.find(
    (theme) => theme.role !== 'MAIN' && /^(Copy of )*Horizon$/i.test(theme.name)
  )
  if (disposable) {
    console.log('deleting', disposable.name, disposable.id)
    await gql(
      `mutation($id: ID!) { themeDelete(id: $id) { deletedThemeId userErrors { message } } }`,
      { id: disposable.id }
    )
  }
}

const name = `Live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
const dup = await gql(
  `mutation($id: ID!, $name: String!) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }`,
  { id: main.id, name }
)
console.log(JSON.stringify(dup, null, 2))
const newTheme = dup.themeDuplicate?.newTheme
if (!newTheme?.id) throw new Error('duplicate failed')
const numeric = newTheme.id.split('/').pop()

// wait for duplicate assets to settle
for (let i = 0; i < 12; i++) {
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const response = await fetch(
    `${REST}/themes/${numeric}/assets.json?asset[key]=${encodeURIComponent('sections/header-group.json')}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const text = await response.text()
  try {
    const json = JSON.parse(text)
    if (json.asset?.value) {
      const parsed = JSON.parse(json.asset.value)
      console.log('duplicate ready, header sections', Object.keys(parsed.sections))
      break
    }
  } catch {}
  console.log('waiting for duplicate assets', i)
}

console.log('publishing', numeric)
console.log(
  JSON.stringify(
    await gql(
      `mutation($id: ID!) {
        themePublish(id: $id) {
          theme { id name role }
          userErrors { message }
        }
      }`,
      { id: newTheme.id }
    ),
    null,
    2
  )
)

function probe(html) {
  return {
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1] ?? null,
    tNum: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1] ?? null,
    social: /lurvox-social-proof/.test(html),
    whiteOutline: /border:\s*2px solid #ffffff/i.test(html),
    tapPlan: html.includes('goToPlan') || html.includes('lurvoxTapWired'),
    cta: /data-cta-button/.test(html),
  }
}

for (let i = 0; i < 24; i++) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const html = await (
    await fetch(`https://www.lurvox.in/?fresh=${Date.now()}&i=${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  const state = probe(html)
  console.log(i, JSON.stringify(state))
  if (state.themeId === numeric && state.social && !state.whiteOutline) {
    console.log('LIVE OK')
    process.exit(0)
  }
}

console.log('published', numeric, '- storefront still catching up')
