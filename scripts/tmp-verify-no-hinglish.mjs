const pages = [
  'https://www.lurvox.in/?v=' + Date.now(),
  'https://www.lurvox.in/pages/find-your-plan?v=' + Date.now(),
  'https://www.lurvox.in/pages/how-lurvox-works?v=' + Date.now(),
  'https://www.lurvox.in/pages/talk-to-a-coach?v=' + Date.now(),
]
for (const url of pages) {
  const html = await (await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })).text()
  const hits = html.match(/ghar[-\s]?ka[-\s]?khana/gi) || []
  console.log(url.split('?')[0], {
    ghar: hits.length,
    homeCooked: /home cooked food/i.test(html),
    vegSlash: /veg\s*\/\s*ghar/i.test(html),
  })
}
