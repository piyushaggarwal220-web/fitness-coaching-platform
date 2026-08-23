const html = await (
  await fetch(`https://www.lurvox.in/?check=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
      'Cache-Control': 'no-cache',
    },
  })
).text()

// Actual plan card opening tags only
const cards = [...html.matchAll(/<div\b[^>]*data-plan-index="[^"]*"[^>]*>/g)].map((m) => {
  const tag = m[0]
  return {
    index: /data-plan-index="([^"]*)"/.exec(tag)?.[1],
    price: /data-plan-price="([^"]*)"/.exec(tag)?.[1],
    duration: /data-plan-duration="([^"]*)"/.exec(tag)?.[1],
    label: /data-plan-label="([^"]*)"/.exec(tag)?.[1],
    link: /data-plan-link="([^"]*)"/.exec(tag)?.[1],
  }
})

console.log('plan cards:', JSON.stringify(cards, null, 2))
console.log('7-DAY TRIAL text:', html.includes('7-DAY TRIAL'))
console.log('7-Day All-Access Trial text:', html.includes('7-Day All-Access Trial'))
console.log('Start 7-day trial:', /Start 7-day trial/i.test(html))
console.log('Try 7 days:', /Try 7 days/i.test(html))
console.log('Rs 179 in visible plan context:', /7 Days[\s\S]{0,80}179|179[\s\S]{0,80}7 Days/.test(html))
