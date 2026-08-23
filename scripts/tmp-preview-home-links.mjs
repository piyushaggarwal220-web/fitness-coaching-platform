const urls = [
  'https://www.lurvox.in/',
  'https://www.lurvox.in/?preview_theme_id=161112981755',
  'https://www.lurvox.in/pages/talk-coach',
  'https://www.lurvox.in/pages/talk-coach?preview_theme_id=161112981755',
]
for (const url of urls) {
  const html = await (await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())).text()
  console.log(url, {
    talkCoachLink: html.includes('/pages/talk-coach'),
    oldLinkCount: (html.match(/\/pages\/talk-to-a-coach/g) || []).length,
    redirect: html.includes('lurvox-talk-path-redirect-v1'),
    form: html.includes('lurvox-talk-coach__form'),
  })
}
