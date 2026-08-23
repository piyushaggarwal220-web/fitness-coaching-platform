const id = 161294057723
const ua = { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0' } }

const home = await fetch(
  `https://www.lurvox.in/?preview_theme_id=${id}&cb=${Date.now()}`,
  ua
).then((r) => r.text())
const page = await fetch(
  `https://www.lurvox.in/pages/talk-to-a-coach?preview_theme_id=${id}&cb=${Date.now()}`,
  ua
).then((r) => r.text())

const hrefs = [...home.matchAll(/href="([^"]*(?:talk-to-a-coach|talk-coach|wa\.me)[^"]*)"/gi)].map(
  (m) => m[1]
)

console.log({
  homeThemeId: home.match(/Shopify\.theme\s*=\s*\{[\s\S]*?id:\s*(\d+)/)?.[1],
  homeHasWaConsult: /wa\.me\/919220451577[^"']*consultation/i.test(home),
  homeTalkHrefs: [...new Set(hrefs)].slice(0, 20),
  pageHasForm: page.includes('lx-consult__form'),
  pageHasPlans:
    page.includes('₹1,499') && page.includes('₹2,499') && page.includes('₹3,999'),
  pageHasWaRedirect: /window\.location\.replace\(\s*["']https:\/\/wa\.me/i.test(page),
  pageHasTitle: page.includes('Book a free consultation call'),
  pageHasApi: page.includes('app.lurvox.in/api/public/talk-to-a-coach'),
  pageTemplate: page.match(/data-template="([^"]+)"/)?.[1],
})
