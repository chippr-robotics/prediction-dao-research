/**
 * Solana JSON-RPC client (spec 063, US3 / T033).
 *
 * Plain `fetch` JSON-RPC — reads (getBalance, getSignaturesForAddress,
 * getLatestBlockhash, getSignatureStatuses) and broadcast (sendTransaction).
 * The endpoint is resolved from config: the optional relay-gateway proxy when
 * configured, else a public cluster endpoint (never-stranded, mirroring the
 * spec-061 Bitcoin gateway posture). Only PUBLIC addresses and base64 SIGNED
 * transactions ever cross this boundary — never keys (FR-021).
 *
 * All amounts are lamports (1 SOL = 1_000_000_000 lamports).
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n

/** Build a JSON-RPC caller bound to an endpoint URL. */
export function createSolanaRpc(endpoint, { fetchImpl } = {}) {
  if (typeof endpoint !== 'string' || !endpoint) {
    throw new Error('createSolanaRpc: endpoint URL is required')
  }
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!doFetch) throw new Error('createSolanaRpc: no fetch implementation available')

  let id = 0
  async function call(method, params) {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    if (!res.ok) throw new Error(`solana rpc: ${method} HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(`solana rpc: ${method}: ${json.error.message || 'error'}`)
    return json.result
  }

  return {
    /** @returns {Promise<bigint>} balance in lamports */
    async getBalance(address) {
      const r = await call('getBalance', [address, { commitment: 'confirmed' }])
      return BigInt(r?.value ?? 0)
    },
    /** Signatures touching an address — used to detect ACTIVITY (funded then emptied), not just balance. */
    async getSignaturesForAddress(address, { limit = 1 } = {}) {
      return (await call('getSignaturesForAddress', [address, { limit }])) || []
    },
    /** @returns {Promise<{blockhash:string, lastValidBlockHeight:number}>} */
    async getLatestBlockhash() {
      const r = await call('getLatestBlockhash', [{ commitment: 'confirmed' }])
      return r?.value
    },
    /** Broadcast a base64-encoded signed transaction. @returns {Promise<string>} signature */
    async sendTransaction(base64Tx) {
      return call('sendTransaction', [base64Tx, { encoding: 'base64', skipPreflight: false }])
    },
    async getSignatureStatuses(signatures) {
      const r = await call('getSignatureStatuses', [signatures, { searchTransactionHistory: false }])
      return r?.value || []
    },
    _call: call,
  }
}

/**
 * Whether an address shows any on-chain activity (nonzero balance OR prior signatures).
 * Used by discovery so an account that was funded and later emptied is still found.
 */
export async function addressHasActivity(rpc, address) {
  const [balance, sigs] = await Promise.all([
    rpc.getBalance(address).catch(() => 0n),
    rpc.getSignaturesForAddress(address, { limit: 1 }).catch(() => []),
  ])
  return balance > 0n || sigs.length > 0
}
