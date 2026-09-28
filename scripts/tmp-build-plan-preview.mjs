import fs from 'node:fs'

const source = fs.readFileSync('scripts/shopify-assets/snippets-lurvox-plan-cards.liquid', 'utf8')
const body = source.replace(/^\{% comment %\}[\s\S]*?\{% endcomment %\}\s*/, '')
const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How the plan cards will look on lurvox.in</title>
<style>html,body{margin:0;background:#0c0a09}</style>
</head>
<body>
${body}
</body>
</html>`
fs.writeFileSync('public/shopify-plan-preview.html', html)
console.log('wrote', html.length)
