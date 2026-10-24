/**
 * Keep /preview7 visually identical to the live storefront.
 * Only fix protocol-relative shop URLs and set a base href so Shopify assets load
 * when this HTML is served from app.lurvox.in.
 */
export function preview7LiveHtml(html: string): string {
  let next = html.replace(/\/\/www\.lurvox\.in/g, 'https://www.lurvox.in')
  if (!next.includes('<base ')) {
    next = next.replace(/<head[^>]*>/i, (head) => `${head}<base href="https://www.lurvox.in/">`)
  }
  return next
}
