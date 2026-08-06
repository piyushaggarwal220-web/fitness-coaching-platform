import {
  buildPageLocator,
  buildShopifyPageUrl,
  fetchShopifyPage,
  gql,
  listShopifyPages,
  parseArgs,
  readOptionalBody,
  resolveShopifyPage,
  toBoolean,
} from './shopify-utils.mjs'

const args = parseArgs()

if (args.help) {
  console.log(`Usage:
  node scripts/shopify-update-page.mjs --page-handle about-us-copy [options]

Required page selector:
  --page-id <gid>
  --page-handle <handle>
  --page-title <title>

Optional edits:
  --title <title>                    Update the page title
  --handle <handle>                  Update the page handle
  --published <true|false>           Update visibility
  --body <html>                      Replace the body inline
  --body-file <path>                 Replace the body from a file
  --template-suffix <suffix>         Set the template suffix
  --clear-template-suffix            Reset to the default template
`)
  process.exit(0)
}

const pageLocator = buildPageLocator(args, 'page')
const overrideBody = readOptionalBody(args)

const nextTitle = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : null
const nextHandle = typeof args.handle === 'string' && args.handle.trim() ? args.handle.trim() : null
const nextPublished = args.published === undefined ? undefined : toBoolean(args.published)
const clearTemplateSuffix = toBoolean(args['clear-template-suffix'], false)
const nextTemplateSuffix =
  typeof args['template-suffix'] === 'string' ? args['template-suffix'] : undefined

const { primaryDomainUrl, pages } = await listShopifyPages()
const pageSummary = resolveShopifyPage(pages, pageLocator)
const page = await fetchShopifyPage(pageSummary.id)

const update = {}
if (nextTitle !== null) update.title = nextTitle
if (nextHandle !== null) update.handle = nextHandle
if (overrideBody !== null) update.body = overrideBody
if (nextPublished !== undefined) update.isPublished = nextPublished

if (clearTemplateSuffix) {
  update.templateSuffix = ''
} else if (nextTemplateSuffix !== undefined) {
  update.templateSuffix = nextTemplateSuffix
}

if (Object.keys(update).length === 0) {
  throw new Error(
    'No page changes requested. Provide at least one of --title, --handle, --body, --body-file, --published, --template-suffix, or --clear-template-suffix'
  )
}

const updated = await gql(
  `mutation updatePage($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page {
        id
        title
        handle
        isPublished
        templateSuffix
        updatedAt
      }
      userErrors {
        code
        field
        message
      }
    }
  }`,
  {
    id: page.id,
    page: update,
  }
)

if (updated.pageUpdate.userErrors?.length) {
  throw new Error(JSON.stringify(updated.pageUpdate.userErrors, null, 2))
}

const updatedPage = updated.pageUpdate.page

console.log(
  JSON.stringify(
    {
      action: 'updated',
      originalPage: {
        id: page.id,
        title: page.title,
        handle: page.handle,
        isPublished: page.isPublished,
        templateSuffix: page.templateSuffix,
        updatedAt: page.updatedAt,
        storefrontUrl: buildShopifyPageUrl(primaryDomainUrl, page.handle),
      },
      updatedPage: {
        ...updatedPage,
        storefrontUrl: buildShopifyPageUrl(primaryDomainUrl, updatedPage.handle),
      },
      primaryDomainUrl,
    },
    null,
    2
  )
)
