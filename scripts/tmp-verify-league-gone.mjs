import fs from 'node:fs'

const token = JSON.parse(
  fs.readFileSync(`${process.env.TEMP}/shopify-auth-token.json`, 'utf8')
).access_token
const data = await (
  await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `{
        pages(first: 80) {
          nodes { handle title isPublished templateSuffix }
        }
      }`,
    }),
  })
).json()
console.log(
  data.data.pages.nodes.filter((p) => /league/i.test(`${p.handle} ${p.title}`))
)

for (const url of [
  'https://www.lurvox.in/pages/consistency-league',
  'https://9uwyq1-0j.myshopify.com/pages/consistency-league',
]) {
  const r = await fetch(url + '?cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
    redirect: 'follow',
  })
  const t = await r.text()
  console.log(url, {
    status: r.status,
    final: r.url,
    league: (t.match(/Consistency League/gi) || []).length,
    title: (t.match(/<title>([^<]+)/i) || [])[1],
  })
}
