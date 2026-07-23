import fs from 'node:fs'
import crypto from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { SHOPIFY_AUTH_URL_PATH, SHOPIFY_STORE, SHOPIFY_TOKEN_PATH, toBoolean } from './shopify-utils.mjs'

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID?.trim() || '7e9cb568cfd431c538f36d1ad3f2b4f6'
const PORT = Number(process.env.SHOPIFY_AUTH_PORT || 13387)
const REDIRECT = `http://127.0.0.1:${PORT}/auth/callback`
const SCOPES = [
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_files',
  'write_files',
  'read_orders',
  'write_orders',
  'read_fulfillments',
  'write_fulfillments',
  'read_customers',
  'write_customers',
  'read_discounts',
  'write_discounts',
  'read_draft_orders',
  'write_draft_orders',
  'read_themes',
  'write_themes',
  'read_content',
  'write_content',
  'read_online_store_pages',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_reports',
]

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const state = b64url(crypto.randomBytes(16))
const codeVerifier = b64url(crypto.randomBytes(32))
const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest())

const params = new URLSearchParams({
  client_id: CLIENT_ID,
  scope: SCOPES.join(','),
  redirect_uri: REDIRECT,
  state,
  response_type: 'code',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
})

const authUrl = `https://${SHOPIFY_STORE}/admin/oauth/authorize?${params.toString()}`
fs.writeFileSync(SHOPIFY_AUTH_URL_PATH, authUrl)
console.log('AUTH_URL=' + authUrl)

function tryOpenBrowser(url) {
  if (!toBoolean(process.env.SHOPIFY_OPEN_BROWSER, false)) {
    return false
  }

  const commands =
    process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : process.platform === 'darwin'
        ? [['open', [url]]]
        : [['xdg-open', [url]]]

  for (const [command, args] of commands) {
    try {
      spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
      return true
    } catch {}
  }

  return false
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
    if (url.pathname !== '/auth/callback') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const shop = url.searchParams.get('shop')
    const gotState = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const err = url.searchParams.get('error')

    if (err) throw new Error(err)
    if (!code) throw new Error('Missing code')
    if (gotState !== state) throw new Error('State mismatch')
    if (shop && !shop.includes(SHOPIFY_STORE.replace('.myshopify.com', ''))) {
      throw new Error('Shop mismatch: ' + shop)
    }

    const tokenRes = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT,
      }),
    })
    const text = await tokenRes.text()
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`)
    const token = JSON.parse(text)
    fs.writeFileSync(SHOPIFY_TOKEN_PATH, JSON.stringify(token, null, 2))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(
      '<html><body style="font-family:sans-serif;padding:40px"><h1>Connected</h1><p>You can close this tab and return to Cursor.</p></body></html>'
    )
    console.log('AUTH_SUCCESS')
    setTimeout(() => process.exit(0), 500)
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/html' })
    res.end(`<html><body><h1>Auth failed</h1><pre>${String(e)}</pre></body></html>`)
    console.error(e)
    setTimeout(() => process.exit(1), 500)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('Listening on', REDIRECT)
  console.log(`Auth URL saved to ${SHOPIFY_AUTH_URL_PATH}`)
  if (!tryOpenBrowser(authUrl)) {
    console.log('Open the AUTH_URL in a browser to finish authentication.')
  }
})

setTimeout(() => {
  console.error('Timed out waiting for browser auth')
  process.exit(1)
}, 300000)
