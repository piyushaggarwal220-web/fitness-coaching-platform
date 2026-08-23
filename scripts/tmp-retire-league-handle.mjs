import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(`${process.env.TEMP}/shopify-auth-token.json`, 'utf8')
).access_token

async function gql(query, variables) {
  const res = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const listed = await gql(`{
  pages(first: 50) {
    nodes { id handle title isPublished }
  }
}`)
const page = listed.pages.nodes.find((p) => p.handle === 'consistency-league')
console.log('found', page)
if (!page) {
  console.log('already gone')
  process.exit(0)
}

const update = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { handle isPublished }
      userErrors { field message }
    }
  }`,
  {
    id: page.id,
    page: {
      handle: 'consistency-league-retired',
      isPublished: false,
      title: 'Retired',
    },
  }
)
console.log(update.pageUpdate)
