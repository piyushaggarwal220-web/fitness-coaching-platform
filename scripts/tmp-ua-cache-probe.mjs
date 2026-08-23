const ua = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
}

for (const [name, userAgent] of Object.entries(ua)) {
  const html = await fetch('https://www.lurvox.in/?cb=' + Date.now() + name, {
    headers: { 'User-Agent': userAgent, 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const group = html.match(/sections--(\d+)__/)?.[1]
  const durations = [...html.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  console.log(name, { group, hide: html.includes('lurvox-hide-1month-style'), durations })
}

const view = await fetch('https://www.lurvox.in/?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': ua.chrome, 'Cache-Control': 'no-cache' },
}).then((r) => r.text())
console.log('view=', {
  group: view.match(/sections--(\d+)__/)?.[1],
  hide: view.includes('lurvox-hide-1month-style'),
  durations: [...view.matchAll(/plan-card-duration[^>]*>\s*([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean),
})
