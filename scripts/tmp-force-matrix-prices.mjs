import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const res = await fetch(
  `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent('snippets/lurvox-plan-compare-inline.liquid')}&t=${Date.now()}`,
  { headers }
)
const val = JSON.parse(await res.text()).asset.value
const m = val.match(/<strong>₹[^<]+<\/strong>/g)
console.log('apiStrongPrices', m)

// Force unique marker + new prices
const stamped = val
  .replace(/₹999/g, '₹999')
  .replace(
    /Renders the LURVOX plan feature matrix[^\n]*/,
    `Renders the LURVOX plan feature matrix. stamp ${Date.now()}`
  )
await fetch(`${REST}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    asset: {
      key: 'snippets/lurvox-plan-compare-inline.liquid',
      value: stamped.includes('₹999')
        ? stamped
        : stamped
            .replace(/₹3,?699/g, '₹2,999')
            .replace(/₹2,?699/g, '₹1,699')
            .replace(/₹1,?699/g, '₹999'),
    },
  }),
})

// Also check if another theme is somehow serving, or password page theme
const html = await (await fetch('https://www.lurvox.in/?preview_theme_id=' + main.id + '&v=' + Date.now())).text()
const matrix = (html.match(/lx-matrix__table[\s\S]{0,500}/) || [''])[0]
console.log('previewMatrix', matrix.replace(/\s+/g, ' ').slice(0, 350))
console.log('hasStamp', /stamp \d+/.test(html))
console.log('themeAssetUrls', [...html.matchAll(/cdn\/shop\/t\/(\d+)\//g)].slice(0, 3).map((x) => x[1]))
