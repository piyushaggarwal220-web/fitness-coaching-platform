import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

function probe(html) {
  return {
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('lurvox_hide_1month'),
    trialCard: html.includes('data-plan-price="179"'),
  }
}

async function home() {
  return (
    await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
}

console.log('BEFORE', probe(await home()))

const before = await gql(`{ onlineStore { passwordProtection { enabled } } }`)
console.log('password before', before.onlineStore.passwordProtection)

const pwd = `tmpflush${Date.now()}`
let method = null

// Prefer GraphQL password protection update
try {
  const on = await gql(
    `mutation($enabled: Boolean!, $password: String) {
      onlineStorePasswordProtectionUpdate(enabled: $enabled, password: $password) {
        onlineStore { passwordProtection { enabled } }
        userErrors { field message }
      }
    }`,
    { enabled: true, password: pwd }
  )
  console.log('GQL enable', JSON.stringify(on).slice(0, 500))
  method = 'gql'
} catch (e) {
  console.log('GQL enable failed:', e.message.slice(0, 300))
}

if (!method) {
  const enable = await fetch(`${REST}/shop.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ shop: { password: pwd, password_enabled: true } }),
  })
  console.log('REST enable', enable.status, (await enable.text()).slice(0, 250))
  method = 'rest'
}

await new Promise((r) => setTimeout(r, 4000))

if (method === 'gql') {
  const off = await gql(
    `mutation($enabled: Boolean!) {
      onlineStorePasswordProtectionUpdate(enabled: $enabled) {
        onlineStore { passwordProtection { enabled } }
        userErrors { field message }
      }
    }`,
    { enabled: false }
  )
  console.log('GQL disable', JSON.stringify(off).slice(0, 500))
} else {
  const disable = await fetch(`${REST}/shop.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ shop: { password_enabled: false } }),
  })
  console.log('REST disable', disable.status, (await disable.text()).slice(0, 250))
}

const after = await gql(`{ onlineStore { passwordProtection { enabled } } }`)
console.log('password after', after.onlineStore.passwordProtection)

console.log('\nPolling / ...')
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const p = probe(await home())
  console.log(i, p)
  if (!p.showTrialPlan && !p.hideSection && p.trialCard) {
    console.log('\nHOMEPAGE CACHE FLUSHED')
    process.exit(0)
  }
}

console.log('\nStill stale')
process.exit(1)
