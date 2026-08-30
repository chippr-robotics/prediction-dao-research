#!/usr/bin/env node
/**
 * scripts/secrets/quicknode-chains.js — derive and VERIFY per-chain URLs from a QuickNode
 * multichain endpoint.
 *
 * QuickNode multichain endpoints serve every network enabled on them from ONE name + ONE token;
 * the chain is selected by a hostname infix:
 *
 *     https://<name>.<slug>.quiknode.pro/<token>      (most networks)
 *     https://<name>.quiknode.pro/<token>             (Ethereum mainnet — NO infix)
 *
 * The estate holds five such endpoints (QUICKNODE_RPC_001..005; the numbering scheme is documented
 * on `managed_secret_ids` in infra/terraform/environments/prod/terraform.tfvars). This tool exists
 * because the failure mode of a hand-derived URL is the bad kind: a wrong infix answers 200 WITH
 * ANOTHER CHAIN'S STATE, not 401 — indistinguishable from working until funds move on the wrong
 * network. So derivation and verification live together, and verification asserts eth_chainId.
 *
 * Usage (payload arrives on STDIN — never as argv, which is world-readable in /proc):
 *
 *   gcloud secrets versions access latest --secret=QUICKNODE_RPC_001_API \
 *     | node scripts/secrets/quicknode-chains.js --verify 1,10,8453,42161
 *
 * Output is one line per chain, REDACTED (host + chain verdict only — the token never reaches
 * stdout, spec 097 rule 4). `--print-env <chains>` additionally writes the derived URLS to fd 3
 * (and only fd 3), so a caller that genuinely needs the values redirects that fd into an env
 * file with restrictive permissions and nothing lands in a terminal scrollback by accident:
 *
 *   ... | node scripts/secrets/quicknode-chains.js --print-env 1,10 3>build.env
 *
 * Non-EVM endpoints (003 sol, 004 btc, 005 zec) have no eth_chainId; --verify refuses chains it
 * has no slug for rather than guessing. This file is deliberately dependency-free (spec 097
 * rule 2: an npm dependency here re-resolves the root lockfile).
 */

/**
 * chainId → { slug, envName }. `slug: null` means the infix is OMITTED (Ethereum mainnet).
 * envName is the frontend build variable the derived URL belongs in (config/networks.js).
 * Extend deliberately; --verify proves a new slug against the chain before anyone configures it.
 */
export const EVM_CHAIN_SLUGS = Object.freeze({
  1: { slug: null, envName: 'VITE_RPC_URL_MAINNET' },
  10: { slug: 'optimism', envName: 'VITE_RPC_URL_OPTIMISM' },
  137: { slug: 'matic', envName: 'VITE_RPC_URL_POLYGON' },
  8453: { slug: 'base-mainnet', envName: 'VITE_RPC_URL_BASE' },
  42161: { slug: 'arbitrum-mainnet', envName: 'VITE_RPC_URL_ARBITRUM' },
  80002: { slug: 'matic-amoy', envName: 'VITE_RPC_URL_AMOY' },
})

const URL_RE = /^https:\/\/([a-z0-9-]+)(?:\.([a-z0-9-]+))?\.quiknode\.pro\/([A-Za-z0-9_-]+)\/?\s*$/

/**
 * Split a multichain endpoint URL into { name, token }, tolerating both the infixed and the
 * infixless (Ethereum-mainnet-base) shapes. Throws on anything that is not a quiknode.pro URL —
 * deriving from an unrecognised payload would silently produce garbage hostnames.
 */
export function parseEndpoint(url) {
  const m = URL_RE.exec(String(url).trim())
  if (!m) throw new Error('payload is not a https://<name>[.<network>].quiknode.pro/<token> URL')
  return { name: m[1], token: m[3] }
}

/** Compose the URL for one chain from a parsed endpoint. */
export function deriveChainUrl(endpoint, chainId) {
  const entry = EVM_CHAIN_SLUGS[chainId]
  if (!entry) throw new Error(`no QuickNode slug is mapped for chainId ${chainId} — add it to EVM_CHAIN_SLUGS deliberately`)
  const { name, token } = endpoint
  return entry.slug === null
    ? `https://${name}.quiknode.pro/${token}/`
    : `https://${name}.${entry.slug}.quiknode.pro/${token}/`
}

/** Redact for display: host only, token replaced. */
export function redact(url) {
  return url.replace(/(quiknode\.pro\/)[^/]+/, '$1<redacted>')
}

async function ethChainId(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (!body?.result) throw new Error(`no result (${JSON.stringify(body?.error ?? body).slice(0, 120)})`)
  return Number.parseInt(body.result, 16)
}

async function readStdin() {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

async function main() {
  const args = process.argv.slice(2)
  const verifyIdx = args.indexOf('--verify')
  const printIdx = args.indexOf('--print-env')
  if (verifyIdx === -1 && printIdx === -1) {
    console.error('usage: ... | quicknode-chains.js --verify <chainIds,csv> | --print-env <chainIds,csv> 3>out.env')
    process.exit(2)
  }
  const chains = (args[(verifyIdx !== -1 ? verifyIdx : printIdx) + 1] || '')
    .split(',').map((s) => Number.parseInt(s.trim(), 10)).filter(Number.isFinite)
  if (chains.length === 0) {
    console.error('no chainIds given')
    process.exit(2)
  }

  const endpoint = parseEndpoint(await readStdin())
  let failed = 0

  for (const chainId of chains) {
    const url = deriveChainUrl(endpoint, chainId)
    if (printIdx !== -1) {
      // fd 3 only — see the header. If fd 3 is not open this throws EBADF, which is the correct
      // outcome: the caller has not said where the credential should go, so it goes nowhere.
      const { envName } = EVM_CHAIN_SLUGS[chainId]
      const { writeSync } = await import('node:fs')
      writeSync(3, `${envName}=${url}\n`)
    }
    try {
      const got = await ethChainId(url)
      if (got === chainId) {
        console.log(`PASS  chain ${chainId}  ${redact(url)}`)
      } else {
        failed += 1
        console.log(`FAIL  chain ${chainId}  ${redact(url)}  answered eth_chainId ${got} — WRONG CHAIN (a mis-derived infix returns 200, not 401)`)
      }
    } catch (e) {
      failed += 1
      console.log(`FAIL  chain ${chainId}  ${redact(url)}  unreachable/invalid: ${e.message}`)
    }
  }
  process.exit(failed === 0 ? 0 : 1)
}

// Import-safe: tests import the pure helpers without running the CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`FATAL: ${e.message}`)
    process.exit(1)
  })
}
