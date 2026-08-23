const urls = [
  'https://www.lurvox.in/pages/talk-to-a-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach?preview_theme_id=161112981755',
  'https://9uwyq1-0j.myshopify.com/pages/talk-to-a-coach?preview_theme_id=161112981755',
]
for (const url of urls) {
  const html = await (await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())).text()
  console.log(url, {
    override: html.includes('lurvox-talk-override'),
    form: html.includes('lurvox-talk-coach__form'),
    api: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
    contact: html.includes('contact-form'),
    template: html.match(/data-template="([^"]+)"/)?.[1],
  })
}
