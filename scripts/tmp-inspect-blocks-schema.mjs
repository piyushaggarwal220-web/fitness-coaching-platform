import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main now', main.id, main.name)

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}

// Find _blocks section liquid schema
for (const key of [
  'sections/_blocks.liquid',
  'sections/blocks.liquid',
  'blocks/_block.liquid',
]) {
  const val = await get(key).catch(() => null)
  if (val) {
    console.log('FOUND', key, 'bytes', val.length)
    const schemaStart = val.indexOf('{% schema %}')
    console.log(val.slice(schemaStart, schemaStart + 1200))
  }
}

const assets = (await (await fetch(`${REST}/themes/${main.id}/assets.json`, { headers })).json()).assets
const blockSections = assets.map((a) => a.key).filter((k) => /sections\/.*blocks/i.test(k) || k.includes('_blocks'))
console.log('block-related sections', blockSections)

// List available custom liquid / HTML blocks
const liquidBlocks = assets
  .map((a) => a.key)
  .filter((k) => k.startsWith('blocks/') && /(liquid|html|custom)/i.test(k))
console.log(
  'candidate blocks',
  liquidBlocks.filter((k) => /custom|liquid|html|code/i.test(k))
)

// Check if there's a built-in custom-liquid block
for (const key of assets.map((a) => a.key).filter((k) => k.startsWith('blocks/'))) {
  if (/custom|liquid-code|html/i.test(key)) console.log(' ', key)
}

// Inspect home_blocks_v2 on main for hide block + plan_1
const index = JSON.parse(await get('templates/index.json'))
const home = index.sections.home_blocks_v2
console.log('hide block present', home.blocks?.lurvox_hide_1month_block)
const planBlock = Object.entries(home.blocks || {}).find(([, b]) => String(b.type).includes('361650c'))
console.log('plan block', planBlock?.[0], {
  plan_1_enabled: planBlock?.[1]?.settings?.plan_1_enabled,
  plan_1_duration: planBlock?.[1]?.settings?.plan_1_duration,
})

// Try using Shopify's "custom-liquid" block if it exists in theme
const customLiquidKey = assets.map((a) => a.key).find((k) => k === 'blocks/custom-liquid.liquid')
console.log('custom-liquid block file', customLiquidKey || 'none')

if (!customLiquidKey) {
  // Search schema in _blocks for accepted types
  const blocksSection = await get('sections/_blocks.liquid')
  if (blocksSection) {
    const m = blocksSection.match(/"blocks"\s*:\s*\[[\s\S]*?\]/)
    console.log('blocks schema snippet', m?.[0]?.slice(0, 800))
  }
}
