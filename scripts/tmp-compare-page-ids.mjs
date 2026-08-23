const urls = [
  'https://www.lurvox.in/pages/consistency-league?v=' + Date.now(),
  'https://www.lurvox.in/pages/league?v=' + Date.now(),
]

for (const url of urls) {
  const html = await fetch(url).then((r) => r.text())
  const meta = {
    url: url.split('?')[0],
    template: html.match(/data-template="([^"]+)"/)?.[1],
    pageId:
      html.match(/"pageId":"?(\d+)/)?.[1] ||
      html.match(/page_id=(\d+)/)?.[1] ||
      html.match(/"page":\{"id":(\d+)/)?.[1],
    themeId: html.match(/themeId":"(\d+)/)?.[1],
    hasBack: html.includes('lx-league__back'),
    sectionId: html.match(/shopify-section-template--(\d+)__([\w-]+)/)?.[0],
    shopifyFeatures: html.match(/Shopify\.shop\s*=\s*"([^"]+)"/)?.[1],
    // Look for any hint of stale compile source
    compiledHint: html.match(/template--(\d+)/)?.[1],
  }
  console.log(meta)
}
