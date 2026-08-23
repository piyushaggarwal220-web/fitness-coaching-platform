const handles = ['contact', 'talk-to-a-coach']
for (const h of handles) {
  const res = await fetch(`https://www.lurvox.in/pages/${h}?t=${Date.now()}`)
  const html = await res.text()
  console.log({
    h,
    status: res.status,
    template: html.match(/data-template="([^"]+)"/)?.[1],
    hasOurForm: html.includes('lurvox-talk-coach__form'),
    hasShopifyContact: html.includes('contact-form'),
  })
}

// Practical fix: overwrite page.contact.json main form with our section for the stuck URL,
// BUT only if contact page also uses it — then use a different approach.
// Instead: inject our form via layout when page.handle == talk-to-a-coach.
