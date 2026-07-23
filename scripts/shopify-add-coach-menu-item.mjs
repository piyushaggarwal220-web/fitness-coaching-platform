/**
 * Add "Coach sign in" to the storefront drawer / main navigation menu.
 */
import { COACH_LOGIN_URL, gql, loadAuthToken } from './shopify-common.mjs'

const COACH_LABEL = 'Coach sign in'
const token = loadAuthToken()

const shopData = await gql(token, `{
  shop { primaryDomain { url } }
  menus(first: 25) {
    nodes {
      id
      handle
      title
      items {
        id
        title
        url
        type
        items { id title url type }
      }
    }
  }
}`)

const menus = shopData.menus.nodes
const mainMenu =
  menus.find((m) => m.handle === 'main-menu') ||
  menus.find((m) => /main/i.test(m.handle) || /main/i.test(m.title)) ||
  menus.find((m) =>
    m.items.some((item) => /home|catalog|catalogue|contact/i.test(item.title))
  )

if (!mainMenu) {
  console.log(
    JSON.stringify(
      {
        error: 'No main menu found',
        menus: menus.map((m) => ({
          handle: m.handle,
          title: m.title,
          items: m.items.map((i) => i.title),
        })),
      },
      null,
      2
    )
  )
  process.exit(1)
}

const alreadyHasCoach = mainMenu.items.some(
  (item) =>
    item.title.toLowerCase() === COACH_LABEL.toLowerCase() ||
    item.url === COACH_LOGIN_URL ||
    /coach sign/i.test(item.title)
)

let result = { action: 'unchanged' }

if (!alreadyHasCoach) {
  const items = [
    ...mainMenu.items.map((item) => ({
      title: item.title,
      type: 'HTTP',
      url: item.url,
    })),
    {
      title: COACH_LABEL,
      type: 'HTTP',
      url: COACH_LOGIN_URL,
    },
  ]

  const updated = await gql(
    token,
    `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          handle
          items { id title url }
        }
        userErrors { field message }
      }
    }`,
    {
      id: mainMenu.id,
      title: mainMenu.title,
      items,
    }
  )

  if (updated.menuUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(updated.menuUpdate.userErrors, null, 2))
  }

  result = {
    action: 'updated',
    items: updated.menuUpdate.menu.items.map((i) => ({ title: i.title, url: i.url })),
  }
} else {
  result = {
    action: 'already_present',
    items: mainMenu.items.map((i) => ({ title: i.title, url: i.url })),
  }
}

const destinationUrl = shopData.shop.primaryDomain.url
let storefrontVerified = false
try {
  const response = await fetch(`${destinationUrl}/?verify_coach_nav=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'LURVOX coach nav verifier',
    },
  })
  const html = await response.text()
  storefrontVerified =
    response.ok && (html.includes(COACH_LOGIN_URL) || html.includes('Coach sign in'))
} catch {}

console.log(
  JSON.stringify(
    {
      destinationUrl,
      menu: { id: mainMenu.id, handle: mainMenu.handle, title: mainMenu.title },
      coachLoginUrl: COACH_LOGIN_URL,
      ...result,
      storefrontVerified,
    },
    null,
    2
  )
)
