/**
 * Predict per-user CLOB session (spec 057, "Option A") — mints each member's OWN Polymarket CLOB API
 * credentials client-side (one L1 wallet signature) and drives order submit/cancel/open-orders DIRECTLY
 * against clob.polymarket.com via the official viem-native `@polymarket/clob-client`.
 *
 * WHY per-user creds (not one shared gateway key): CLOB V2 binds every order to its signer — it rejects
 * any order whose `signer` != the address the API key was registered under ("the order signer address has
 * to be the address of the API KEY" / 401 "Invalid api key"). A single shared key therefore cannot submit
 * trades for other wallets (verified against live CLOB). Each member derives their OWN creds; they live
 * in-session only (sessionStorage), never on a FairWins server — consistent with the no-backend rule.
 *
 * WHY client-direct: clob.polymarket.com serves `Access-Control-Allow-Origin: *` (verified), so the SPA
 * calls it straight from the browser. The creds never transit our gateway. The gateway stays for the
 * PUBLIC read feed (markets/positions/fee-rate) only.
 *
 * Attribution (FairWins builder revenue) rides on the shared builder credential via `BuilderConfig` remote
 * signing at the gateway (POLY_BUILDER_* headers). When that isn't configured, trades still go through
 * UNATTRIBUTED — never stranded (FR-015).
 *
 * NOTE: EOA sessions only (signatureType 0: maker == signer == funder). Passkey/Safe (types 1/2/3) stay
 * deferred behind PASSKEY_PREDICT_ENABLED — CLOB binds the API key to the EOA, and ERC-1271 order validation
 * must be confirmed end-to-end first (see tradeSigner.js).
 */
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'

export const CLOB_HOST = 'https://clob.polymarket.com'
export const POLYGON = 137

// signatureType 0 = EOA. The order's maker/signer/funder are all the connected EOA.
const SIG_TYPE_EOA = 0

const credsKey = (address) => `predict.clob.creds.${String(address || '').toLowerCase()}`
const safeStorage = () => {
  try { return globalThis.sessionStorage ?? null } catch { return null }
}

/** The member's cached CLOB creds for this session, or null. Shape: { key, secret, passphrase }. */
export function loadCachedCreds(address, storage = safeStorage()) {
  try {
    const raw = storage?.getItem(credsKey(address))
    const c = raw ? JSON.parse(raw) : null
    return c?.key && c?.secret && c?.passphrase ? c : null
  } catch {
    return null
  }
}

export function cacheCreds(address, creds, storage = safeStorage()) {
  try { storage?.setItem(credsKey(address), JSON.stringify(creds)) } catch { /* private mode / quota — derive again next time */ }
}

export function clearCachedCreds(address, storage = safeStorage()) {
  try { storage?.removeItem(credsKey(address)) } catch { /* noop */ }
}

/**
 * Mint (or reuse) the member's own CLOB creds. `createOrDeriveApiKey` is deterministic per wallet —
 * one L1 EIP-712 signature (a wallet prompt, no gas). Cached per address for the session so the member
 * signs at most once. Returns { key, secret, passphrase }.
 */
export async function ensureClobCreds(walletClient, { address, storage = safeStorage(), ClobClientImpl = ClobClient } = {}) {
  const addr = address ?? walletClient?.account?.address
  const cached = loadCachedCreds(addr, storage)
  if (cached) return cached
  const boot = new ClobClientImpl(CLOB_HOST, POLYGON, walletClient)
  const creds = await boot.createOrDeriveApiKey()
  if (creds?.key && creds?.secret && creds?.passphrase) cacheCreds(addr, creds, storage)
  return creds
}

/**
 * Builder attribution config for FairWins revenue (POLY_BUILDER_* headers). The builder creds are a
 * SHARED secret, so they stay server-side: this returns a light client the CLOB SDK calls to fetch the
 * four headers from the gateway's remote builder-sign endpoint (the gateway holds the creds and does the
 * HMAC). We deliberately do NOT import `@polymarket/builder-signing-sdk` here — it statically pulls in
 * `node:crypto` (`createHmac`) and cannot be bundled for the browser; it is a server-only SDK. The CLOB
 * client duck-types this object: it only calls `isValid()` and `generateBuilderHeaders(method, path, body)`
 * (see `@polymarket/clob-client` `_generateBuilderHeaders`). The gateway generates + bakes the timestamp
 * into `POLY_BUILDER_TIMESTAMP` and signs over the same body, so the shim just forwards {method,path,body}.
 * Returns undefined when no gateway is configured — trades then post UNATTRIBUTED (never-stranded, FR-015).
 * @param {string} gatewayBaseUrl  e.g. VITE_RELAYER_URL (no trailing slash); '' => no attribution
 * @param {number} [chainId]
 */
export function makeBuilderConfig(gatewayBaseUrl, chainId = POLYGON, { fetchImpl } = {}) {
  const base = String(gatewayBaseUrl || '').trim().replace(/\/$/, '')
  if (!base) return undefined
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
  const url = `${base}/v1/polymarket/${chainId}/builder-sign`
  return {
    isValid: () => true,
    // Attribution is best-effort: any failure returns undefined so the SDK posts the order UNATTRIBUTED
    // rather than blocking it (never-stranded, FR-015).
    async generateBuilderHeaders(method, path, body) {
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, path, body: body ?? null }),
        })
        if (!res?.ok) return undefined
        const h = await res.json()
        return h?.POLY_BUILDER_API_KEY && h?.POLY_BUILDER_SIGNATURE ? h : undefined
      } catch {
        return undefined
      }
    },
  }
}

/**
 * An authed CLOB client bound to the member's wallet + their creds, with optional builder attribution.
 * @param {object} walletClient  viem WalletClient (wagmi useWalletClient)
 * @param {{key,secret,passphrase}} creds
 * @param {{ builderConfig?: object, ClobClientImpl?: Function }} [opts]
 */
export function makeClobClient(walletClient, creds, { builderConfig, ClobClientImpl = ClobClient } = {}) {
  return new ClobClientImpl(
    CLOB_HOST,
    POLYGON,
    walletClient,
    creds,
    SIG_TYPE_EOA,
    undefined, // funderAddress = signer (EOA)
    undefined, // geoBlockToken
    false, // useServerTime
    builderConfig, // POLY_BUILDER_* attribution (optional)
  )
}

/**
 * Submit a signed CLOB order (build + sign + post in one call — the SDK resolves tick size, fee rate, and
 * negRisk, and rounds amounts). Returns { orderId, status, raw }.
 * @param {object} client  makeClobClient result
 * @param {{ tokenId, side:'BUY'|'SELL', price:number, size:number, negRisk?:boolean, orderType?:string }} order
 */
export async function submitOrder(client, { tokenId, side, price, size, negRisk, orderType = OrderType.GTC }) {
  const resp = await client.createAndPostOrder(
    { tokenID: String(tokenId), price: Number(price), side: side === 'SELL' ? Side.SELL : Side.BUY, size: Number(size) },
    { negRisk: Boolean(negRisk) },
    orderType,
  )
  return {
    orderId: resp?.orderID ?? resp?.orderId ?? resp?.id ?? null,
    status: resp?.status ?? (resp?.success ? 'accepted' : null),
    raw: resp,
  }
}

/** Cancel one open order by id. Returns { cancelled, raw }. */
export async function cancelOrder(client, orderId) {
  const resp = await client.cancelOrder({ orderID: String(orderId) })
  return { cancelled: Boolean(resp?.canceled ?? resp?.success ?? true), raw: resp }
}

/** The member's open orders (optionally scoped to one market/condition). Returns an array. */
export async function fetchOpenOrders(client, { market } = {}) {
  const orders = await client.getOpenOrders(market ? { market: String(market) } : undefined)
  return Array.isArray(orders) ? orders : (orders?.data ?? [])
}

export { Side, OrderType }
