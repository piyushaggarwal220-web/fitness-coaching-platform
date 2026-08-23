import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
}

const pagesRes = await fetch(`${REST}/pages.json?limit=250`, { headers })
const pages = (await pagesRes.json()).pages.map((p) => ({
  id: p.id,
  handle: p.handle,
  title: p.title,
  templateSuffix: p.template_suffix,
  published: Boolean(p.published_at),
}))

const assetsRes = await fetch(`${REST}/themes/${THEME}/assets.json`, { headers })
const assets = (await assetsRes.json()).assets.map((a) => a.key)
const pageTemplates = assets.filter((k) => k.startsWith('templates/page'))
const leagueSections = assets.filter((k) => /league/i.test(k))

const templateFor = (suffix) =>
  suffix ? `templates/page.${suffix}.json` : 'templates/page.json'

const pageReport = pages.map((p) => ({
  ...p,
  expectedTemplate: templateFor(p.templateSuffix),
  templateExists:
    assets.includes(templateFor(p.templateSuffix)) ||
    assets.includes(templateFor(p.templateSuffix).replace('.json', '.liquid')),
}))

// What does the working league page actually render, and does the back link exist?
const leagueLive = await fetch(`https://www.lurvox.in/pages/consistency-league?t=${Date.now()}`, {
  headers: UA,
})
const leagueHtml = await leagueLive.text()

const redirectsRes = await fetch(`${REST}/redirects.json?limit=250`, { headers })
const redirects = (await redirectsRes.json()).redirects.map((r) => ({
  path: r.path,
  target: r.target,
}))

console.log(
  JSON.stringify(
    {
      pagesMissingTemplate: pageReport.filter((p) => !p.templateExists),
      allPages: pageReport,
      pageTemplates,
      leagueSections,
      consistencyLeaguePage: {
        status: leagueLive.status,
        hasBackLink: leagueHtml.includes('lx-league__back'),
        hasCrazyEligibility: leagueHtml.includes('crazy-eligibility'),
        mentions12Month: leagueHtml.includes('12-month'),
      },
      redirects: redirects.filter((r) => /league|plan/i.test(r.path + r.target)),
    },
    null,
    2
  )
)
