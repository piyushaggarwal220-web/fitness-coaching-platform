import fs from 'node:fs'
import path from 'node:path'

const store = '9uwyq1-0j.myshopify.com'
const api = `https://${store}/admin/api/2025-01/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const meta = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-home-redesign-draft.json'), 'utf8')
)

if (!meta.draftThemeId || meta.draftThemeId === meta.mainThemeId) {
  throw new Error('Refusing to publish: redesign draft ID is missing or matches current MAIN')
}

const response = await fetch(api, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
  },
  body: JSON.stringify({
    query: `mutation themePublish($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { field message }
      }
    }`,
    variables: { id: meta.draftThemeId },
  }),
})
const result = await response.json()
const payload = result.data?.themePublish
if (!response.ok || result.errors || payload?.userErrors?.length || payload?.theme?.role !== 'MAIN') {
  throw new Error(JSON.stringify(result, null, 2))
}

console.log('Published:', payload.theme.name, payload.theme.id)

for (let attempt = 1; attempt <= 12; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const html = await fetch(`https://www.lurvox.in/?redesign=${Date.now()}-${attempt}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }).then((res) => res.text())

  const checks = {
    header: html.includes('data-lx-hdr'),
    homepage: html.includes('data-lx-home'),
    comparison: html.includes('lx-plan-compare__table'),
    price999: html.includes('999'),
    price1699: html.includes('1699'),
    price2999: html.includes('2999'),
    retiredPlanAbsent: !html.includes('checkout?plan=1_month'),
  }
  console.log({ attempt, ...checks })
  if (Object.values(checks).every(Boolean)) {
    console.log('REDESIGN LIVE')
    process.exit(0)
  }
}

throw new Error('Published theme, but storefront verification did not converge')
