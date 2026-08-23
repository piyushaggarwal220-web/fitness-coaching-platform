import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

async function gql(query, variables) {
  const res = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const main = 'gid://shopify/OnlineStoreTheme/161086767355'
const draft = 'gid://shopify/OnlineStoreTheme/160984367355' // LURVOX Draft

console.log('switching to draft…')
console.log(
  JSON.stringify(
    (
      await gql(
        `mutation themePublish($id: ID!) {
          themePublish(id: $id) { theme { id name role } userErrors { message } }
        }`,
        { id: draft }
      )
    ).themePublish,
    null,
    2
  )
)

await new Promise((r) => setTimeout(r, 5000))

console.log('switching back to sale focus…')
console.log(
  JSON.stringify(
    (
      await gql(
        `mutation themePublish($id: ID!) {
          themePublish(id: $id) { theme { id name role } userErrors { message } }
        }`,
        { id: main }
      )
    ).themePublish,
    null,
    2
  )
)

await new Promise((r) => setTimeout(r, 8000))

for (const url of [
  'https://www.lurvox.in/pages/consistency-league',
  'https://www.lurvox.in/pages/league',
]) {
  const t = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' }).then((r) => r.text())
  console.log(url, {
    free: t.includes('Free with every plan'),
    replace: t.includes("location.replace('/pages/league')"),
    template: (t.match(/data-template="[^"]+"/) || [])[0],
    sectionId: (t.match(/id="shopify-section-template--[^"]+"/) || [])[0],
  })
}
