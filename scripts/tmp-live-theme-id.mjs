const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?t=${Date.now()}`)).text()
console.log({
  cta: html.includes('lurvox-talk-cta-highlight'),
  override: html.includes('lurvox-talk-override'),
  form: html.includes('lurvox-talk-coach__form'),
  themeId: html.match(/Shopify\.theme\s*=\s*\{[\s\S]*?id:\s*(\d+)/)?.[1],
  themeName: html.match(/Shopify\.theme\s*=\s*\{[\s\S]*?name:\s*'([^']+)'/)?.[1],
  schemaTheme: html.match(/"theme_store_id":\s*([^,\n]+)/)?.[1],
})
