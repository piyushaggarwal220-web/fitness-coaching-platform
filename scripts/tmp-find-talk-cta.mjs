const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  cache: 'no-store',
  headers: { 'User-Agent': 'Mozilla/5.0 audit' },
}).then((r) => r.text())

const idx = []
let from = 0
while (true) {
  const at = html.indexOf('talk-to-a-coach', from)
  if (at === -1) break
  idx.push(at)
  from = at + 1
}

console.log('occurrences:', idx.length)
for (const at of idx) {
  console.log('\n---\n', html.slice(Math.max(0, at - 400), at + 260).replace(/\s+/g, ' '))
}

for (const needle of ['lurvox-fab', 'Book Consultation', 'Payment Help', 'CHOOSE YOUR PLAN']) {
  console.log(`\n[${needle}] present:`, html.includes(needle))
}
