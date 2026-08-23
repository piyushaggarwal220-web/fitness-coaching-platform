const html = await fetch('https://www.lurvox.in/pages/coaching-plans?cb=' + Date.now()).then((r) =>
  r.text()
)
const mentions = [...html.matchAll(/[^<>]{0,10}\d+\s*Months?[^<>]{0,50}/gi)].map((m) =>
  m[0].replace(/\s+/g, ' ').trim()
)
console.log({ has1Dash: /1 Month\s*—/.test(html), mentions: mentions.slice(0, 12) })
