const urls = [
  'https://www.lurvox.in/index',
  'https://www.lurvox.in/?view=',
  'https://www.lurvox.in/',
]

for (const base of urls) {
  const url = `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`
  const html = await (
    await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  console.log(
    JSON.stringify({
      url: base,
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1] ?? null,
      tNum: html.match(/\/cdn\/shop\/t\/(\d+)\//)?.[1] ?? null,
      social: /lurvox-social-proof/.test(html),
      whiteOutline: /border:\s*2px solid #ffffff/i.test(html),
      tapPlan: html.includes('goToPlan') || html.includes('lurvoxTapWired'),
      cta: /data-cta-button/.test(html),
      trial: /7-DAY TRIAL/i.test(html),
    })
  )
}
