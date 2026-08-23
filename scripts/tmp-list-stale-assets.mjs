const html = await fetch('https://www.lurvox.in/?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

const assets = [...html.matchAll(/https?:\/\/[^"'\\s]+\/cdn\/shop\/[^"'\\s]+/gi)].map((m) => m[0])
const unique = [...new Set(assets)]
const js = unique.filter((u) => /\.js(\?|$)/i.test(u))
const css = unique.filter((u) => /\.css(\?|$)/i.test(u))
console.log('js count', js.length)
console.log(js.slice(0, 40).join('\n'))
console.log('\ncss count', css.length)
console.log(css.slice(0, 20).join('\n'))

// theme asset filenames referenced
const files = [
  ...html.matchAll(/assets\/([a-zA-Z0-9._-]+\.(?:js|css))/g),
].map((m) => m[1])
console.log('\nasset filenames', [...new Set(files)].slice(0, 50))

// floating panel / custom scripts
const custom = [...html.matchAll(/(floating|lurvox|plan|mobile)[^"'\\s]*\.(js|css)/gi)].map(
  (m) => m[0]
)
console.log('\ncustom-ish', [...new Set(custom)])
