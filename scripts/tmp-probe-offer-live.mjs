import fs from 'fs'
import path from 'path'
import os from 'os'

const auth = JSON.parse(
  fs.readFileSync(path.join(os.tmpdir(), 'shopify-auth-token.json'), 'utf8')
)
const token = auth.access_token
const shop = '9uwyq1-0j.myshopify.com'
const MAIN = '161390362875'
const OLD = '161389281531'

function probe(html) {
  const theme =
    html.match(/Shopify\.theme\s*=\s*\{[\s\S]*?id:\s*['"]?(\d+)/)?.[1] ||
    html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1] ||
    null
  return {
    theme,
    offerStrip: html.includes('lurvox-offer-strip'),
    save5: html.includes('SAVE5'),
    saleEnds: /SALE ENDS IN/i.test(html),
    priceIncreases: html.includes('Price increases in'),
    drawerLogin: html.includes('lurvox-drawer-login'),
    oldLogin: /EXISTING CLIENT OR PAYMENT DONE/i.test(html),
    limitedOffer: /LIMITED OFFER/i.test(html),
  }
}

const urls = [
  `https://www.lurvox.in/index?cb=${Date.now()}`,
  `https://www.lurvox.in/?view=&cb=${Date.now()}`,
  `https://www.lurvox.in/?preview_theme_id=${MAIN}&cb=${Date.now()}`,
  `https://www.lurvox.in/?preview_theme_id=${OLD}&cb=${Date.now()}`,
  `https://${shop}/?preview_theme_id=${MAIN}&cb=${Date.now()}`,
]

for (const u of urls) {
  const r = await fetch(u, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'Mozilla/5.0',
    },
    redirect: 'follow',
  })
  const html = await r.text()
  console.log(JSON.stringify({ url: u.slice(0, 70), ...probe(html) }))
}
