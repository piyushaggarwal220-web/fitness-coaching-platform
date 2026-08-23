import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(`${process.env.TEMP}/shopify-auth-token.json`, 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'

async function gql(query, variables) {
  const res = await fetch(GQL, {
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
  pages(first: 5, query: "handle:find-your-plan") {
    nodes { id handle title templateSuffix body }
  }
}`)
const page = listed.pages.nodes[0]
console.log('page', page.id, page.templateSuffix)

const update = await gql(
  `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix updatedAt }
      userErrors { field message }
    }
  }`,
  {
    id: page.id,
    page: {
      title: 'Find your plan',
      templateSuffix: 'find-your-plan',
      body: '',
    },
  }
)
console.log(JSON.stringify(update.pageUpdate, null, 2))

await new Promise((r) => setTimeout(r, 8000))
const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0 verify' },
  })
).text()
console.log({
  ghar: /Ghar ka khana/.test(html),
  homeCooked: /Home cooked food\. Keep it simple/.test(html),
})
