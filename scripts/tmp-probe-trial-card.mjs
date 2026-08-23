const results = []
for (let i = 0; i < 10; i++) {
  const html = await (
    await fetch(`https://www.lurvox.in/?p=${Date.now()}-${i}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
        'Cache-Control': 'no-cache',
      },
    })
  ).text()
  results.push({
    i,
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    themeName: html.match(/"name":"([^"]+)","id":\d+/)?.[1],
    showTrialPlan: html.includes('showTrialPlan'),
    hideSection: html.includes('__lurvox_hide_1month'),
    stabilize: html.includes('lurvox-stabilize-trial'),
    trialCard: html.includes('data-plan-price="179"'),
  })
}
console.table(results)
const clean = results.filter((r) => !r.showTrialPlan && r.trialCard)
console.log(`Clean (no toggler, trial present): ${clean.length}/${results.length}`)
