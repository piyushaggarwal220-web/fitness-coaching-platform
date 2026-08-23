for (const u of [
  'https://www.lurvox.in/pages/talk-coach?view=',
  'https://www.lurvox.in/pages/talk-coach?view=page',
  'https://www.lurvox.in/pages/talk-to-a-coach',
]) {
  const res = await fetch(u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  let html = ''
  if (res.status === 200) html = await res.text()
  console.log(u, {
    status: res.status,
    loc: res.headers.get('location'),
    stamp: html.includes('lurvox-talk-wa-redirect'),
    form: html.includes('lurvox-talk-coach__form'),
    wa: /wa\.me\/919220451577\?text=i%20want%20a%20free/.test(html),
  })
}
