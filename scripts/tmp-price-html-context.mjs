const html = await (
  await fetch(`https://www.lurvox.in/?nocache=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; LurvoxPriceCheck/1.0)',
    },
  })
).text()

function contexts(re, label) {
  let m
  const out = []
  const r = new RegExp(re, 'gi')
  while ((m = r.exec(html)) && out.length < 8) {
    const i = m.index
    out.push(html.slice(Math.max(0, i - 80), i + 80).replace(/\s+/g, ' '))
  }
  console.log('\n==', label, out.length)
  for (const c of out) console.log(' ', c)
}

contexts('2,?699', '2699')
contexts('3,?699', '3699')
contexts('566', '566')
contexts('₹\\s*999', '999')
console.log('\nhtmlLen', html.length)
console.log('marker333', html.includes('333/mo'))
console.log('marker sales closer', html.includes('lx-close__price'))
console.log('marker plan cards', /plan_2_price|Quick Reset/.test(html))
