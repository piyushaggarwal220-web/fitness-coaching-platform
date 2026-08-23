const html = await (
  await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text()
const re = /.{0,60}[Ll]eague.{0,60}/g
console.log(html.match(re)?.slice(0, 20) || 'none')
const app = await (
  await fetch('https://app.lurvox.in/plans/3-months', { headers: { 'User-Agent': 'Mozilla/5.0' } })
).text()
console.log('app snippets', app.match(re)?.slice(0, 15))
