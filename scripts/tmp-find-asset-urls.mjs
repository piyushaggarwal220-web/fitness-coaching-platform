const html = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

for (const name of [
  'floating-panel.js',
  'rte-formatter.js',
  'section-hydration.js',
  'utilities.js',
  'base.css',
  'styles.css',
]) {
  const re = new RegExp(`[^"'\\s>]*${name.replace('.', '\\.')}[^"'\\s>]*`, 'gi')
  const hits = [...html.matchAll(re)].map((m) => m[0])
  console.log('\n' + name)
  console.log(hits.slice(0, 5).join('\n'))
}

// Also check theme id in asset paths
const themeNums = [...html.matchAll(/\/cdn\/shop\/t\/(\d+)\//g)].map((m) => m[1])
console.log('\ntheme nums', [...new Set(themeNums)])
