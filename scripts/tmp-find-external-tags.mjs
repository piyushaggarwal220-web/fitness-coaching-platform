const html = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const hits = {
  gtm: [...html.matchAll(/GTM-[A-Z0-9]+/g)].map((m) => m[0]),
  gtag: [...html.matchAll(/G-[A-Z0-9]+/g)].map((m) => m[0]).slice(0, 10),
  fbq: /fbq\(|facebook\.net|meta pixel/i.test(html),
  clarity: /clarity\.ms|clarity\(/i.test(html),
  hotjar: /hotjar/i.test(html),
  aisensy: /aisensy/i.test(html),
  shopifyPixel: /web-pixels-manager|shopify-analytics/i.test(html),
  customHead: (html.match(/<!--[^>]{0,40}-->/g) || []).slice(0, 20),
  scriptSrcs: [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((s) => !/shopify|cdn\.shopify|myshopify|lurvox\.in\/cdn/i.test(s))
    .slice(0, 30),
}
console.log(JSON.stringify(hits, null, 2))
