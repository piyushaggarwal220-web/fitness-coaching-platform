const html = await (await fetch('https://www.lurvox.in/?t=' + Date.now())).text()
let from = 0
while (true) {
  const i = html.indexOf('talk-to-a-coach', from)
  if (i < 0) break
  console.log('\n---', i, '---')
  console.log(html.slice(Math.max(0, i - 120), i + 80))
  from = i + 1
}
console.log('\nfloating bar present?', html.includes('mobile-floating') || html.includes('lurvox-fab') || html.includes('floating-bar'))
