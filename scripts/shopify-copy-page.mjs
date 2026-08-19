import {
  buildPageLocator,
  buildShopifyPageUrl,
  describePageLocator,
  ensureUniqueHandle,
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
  node scripts/shopify-copy-page.mjs --source-handle about-us [options]

Required source selector:
  --source-id <gid>
  --source-handle <handle>
  --source-title <title>

Optional copy settings:
  --new-title <title>          Override the copied page title
  --new-handle <handle>        Override the copied page handle
  --title-suffix <suffix>      Default: " (Copy)"
  --handle-suffix <suffix>     Default: "-copy"
  --published <true|false>     Default: false
  --body <html>                Replace the copied body inline
  --body-file <path>           Replace the copied body from a file
  --template-suffix <suffix>   Override the template suffix
`)
  process.exit(0)
}

const sourceLocator = buildPageLocator(args, 'source')
const overrideBody = readOptionalBody(args)
const publishCopy = toBoolean(args.published, false)

const customTitle =
  typeof args['new-title'] === 'string' && args['new-title'].trim() ? args['new-title'].trim() : null
const customHandle =
  typeof args['new-handle'] === 'string' && args['new-handle'].trim()
    ? args['new-handle'].trim()
    : null
const titleSuffix =
  args['title-suffix'] === false
    ? ''
    : typeof args['title-suffix'] === 'string'
      ? args['title-suffix']
      : ' (Copy)'
const handleSuffix =
  args['handle-suffix'] === false
    ? ''
    : typeof args['handle-suffix'] === 'string'
      ? args['handle-suffix']
      : '-copy'
const templateSuffix =
  args['template-suffix'] === true
    ? ''
    : typeof args['template-suffix'] === 'string'
      ? args['template-suffix']
      : null

const { primaryDomainUrl, pages } = await listShopifyPages()
const sourceSummary = resolveShopifyPage(pages, sourceLocator)
const sourcePage = await fetchShopifyPage(sourceSummary.id)

const existingHandles = new Set(pages.map((page) => page.handle))
const nextTitle = customTitle || `${sourcePage.title}${titleSuffix}`
const nextHandle = customHandle || ensureUniqueHandle(`${sourcePage.handle}${handleSuffix}`, existingHandles)

const pageInput = {
  title: nextTitle,
  handle: nextHandle,
  body: overrideBody ?? sourcePage.body,
  isPublished: publishCopy,
}

if (templateSuffix !== null) {
  pageInput.templateSuffix = templateSuffix
} else if (sourcePage.templateSuffix) {
  pageInput.templateSuffix = sourcePage.templateSuffix
}

const created = await gql(
  `mutation copyPage($page: PageCreateInput!) {
    pageCreate(page: $page) {
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
  { page: pageInput }
)

if (created.pageCreate.userErrors?.length) {
  throw new Error(JSON.stringify(created.pageCreate.userErrors, null, 2))
}

const copiedPage = created.pageCreate.page

console.log(
  JSON.stringify(
    {
      action: 'copied',
      sourceLocator: describePageLocator(sourceLocator),
      sourcePage: {
        id: sourcePage.id,
        title: sourcePage.title,
        handle: sourcePage.handle,
        isPublished: sourcePage.isPublished,
        templateSuffix: sourcePage.templateSuffix,
        updatedAt: sourcePage.updatedAt,
        storefrontUrl: buildShopifyPageUrl(primaryDomainUrl, sourcePage.handle),
      },
      copiedPage: {
        ...copiedPage,
        storefrontUrl: buildShopifyPageUrl(primaryDomainUrl, copiedPage.handle),
      },
      bodySource: overrideBody === null ? 'copied-from-source' : 'custom-body',
      primaryDomainUrl,
    },
    null,
    2
  )
)
