const urls = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/index',
  'https://www.lurvox.in/?view=',
  'https://lurvox.in/',
]

for (const url of urls) {
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    })
    const html = await res.text()
    console.log(
      JSON.stringify({
        url,
        final: res.url,
        status: res.status,
        etag: res.headers.get('etag'),
        lastMod: res.headers.get('last-modified'),
        cf: res.headers.get('cf-cache-status'),
        cache: res.headers.get('cache-control'),
        link: res.headers.get('link')?.slice(0, 120),
        themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
        tNum: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
        stamp: html.match(/lurvox-cache-bust \d+/)?.[0],
        hasForce: html.includes('lurvoxTapWired'),
        len: html.length,
      })
    )
  } catch (e) {
    console.log(url, e.message)
  }
}

// Confirm API main
import fs from 'node:fs'
import path from 'node:path'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const themes = await (
  await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes.json', {
    headers: { 'X-Shopify-Access-Token': token },
  })
).json()
console.log(
  'API main',
  themes.themes.find((t) => t.role === 'main')
)

// Non-home page on new theme
const plans = await (
  await fetch('https://www.lurvox.in/pages/talk-to-a-coach?t=' + Date.now(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    },
  })
).text()
console.log({
  talkTheme: plans.match(/"id":(\d+),"schema_name"/)?.[1],
  talkT: plans.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1],
  talkStamp: plans.match(/lurvox-cache-bust \d+/)?.[0],
})
