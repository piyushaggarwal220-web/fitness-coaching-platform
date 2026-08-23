import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const numericThemeId = '161112981755'

const pageContact = `${JSON.stringify(
  {
    sections: {
      main: {
        type: 'lurvox-talk-to-coach',
        settings: {
          heading: 'Talk to a coach',
          subheading:
            'Free consultation. Share your goals and we will help you decide if LURVOX is the right fit. You can submit this form up to 2 times.',
          button_label: 'Send message',
          accent_color: '#FF6200',
        },
      },
    },
    order: ['main'],
  },
  null,
  2
)}\n`

const response = await fetch(`https://${STORE}/admin/api/2025-01/themes/${numericThemeId}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({
    asset: { key: 'templates/page.contact.json', value: pageContact },
  }),
})
if (!response.ok) throw new Error(await response.text())
console.log('uploaded page.contact.json', response.status)

await new Promise((r) => setTimeout(r, 3000))

const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?t=${Date.now()}`)).text()
console.log({
  template: html.match(/data-template="([^"]+)"/)?.[1],
  hasForm: html.includes('lurvox-talk-coach__form'),
  hasApi: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
  hasShopifyContact: html.includes('contact-form'),
})
