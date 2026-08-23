import fs from 'node:fs'
import path from 'node:path'

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`,
  `https://www.lurvox.in/pages/plans?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?preview_theme_id=161375289595&cb=${Date.now()}`,
]

for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    redirect: 'follow',
  })
  const html = await res.text()
  console.log(
    JSON.stringify(
      {
        url: url.replace(/\d{10,}/g, '…'),
        status: res.status,
        finalUrl: res.url,
        cacheControl: res.headers.get('cache-control'),
        cfCache: res.headers.get('cf-cache-status'),
        xCache: res.headers.get('x-cache'),
        age: res.headers.get('age'),
        powered: res.headers.get('powered-by'),
        shopify: res.headers.get('x-shopid') || res.headers.get('x-sorting-hat-shopid'),
        themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
        stamp: html.match(/lurvox-cache-bust \d+/)?.[0] || null,
        hasTap: html.includes('window.location.href = link'),
        hasCta: /data-cta-button/.test(html),
        hasGoToPlan: html.includes('goToPlan'),
        seats: html.includes('data-lurvox-seats-filled'),
        priceCards: [...html.matchAll(/<div\b[^>]*data-plan-price="([^"]+)"/g)].map((m) => m[1]),
      },
      null,
      2
    )
  )
}
