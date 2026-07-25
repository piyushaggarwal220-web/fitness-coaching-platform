import fs from 'node:fs'

const raw = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-draft-templates-index.json',
  'utf8'
)
const jsonStart = raw.indexOf('{')
const data = JSON.parse(raw.slice(jsonStart))

function walk(node, path = []) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, path.concat(i)))
    return
  }
  if (node.settings && typeof node.settings === 'object' && 'cta_text' in node.settings) {
    console.log('FOUND at', path.join('.'))
    console.log('type:', node.type)
    console.log('settings keys:', Object.keys(node.settings).slice(0, 30))
    console.log('cta_text:', node.settings.cta_text)
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'settings') continue
    walk(v, path.concat(k))
  }
}

walk(data)
