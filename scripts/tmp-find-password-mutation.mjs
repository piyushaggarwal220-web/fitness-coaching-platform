import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const versions = ['2025-01', '2025-04', '2025-07', '2025-10', '2026-01', '2026-04', 'unstable']

for (const ver of versions) {
  const GQL = `https://9uwyq1-0j.myshopify.com/admin/api/${ver}/graphql.json`
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `{ __type(name: "Mutation") { fields { name } } }`,
    }),
  })
  const json = await res.json()
  if (json.errors) {
    console.log(ver, 'errors', json.errors[0]?.message)
    continue
  }
  const names = (json.data?.__type?.fields || []).map((f) => f.name)
  const hits = names.filter((n) => /password|onlineStore/i.test(n))
  console.log(ver, hits)
}
