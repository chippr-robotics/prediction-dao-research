import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the CSP connect-src blockchain RPC allowlist.
//
// The browser blocks fetch/XHR to any host not listed in `connect-src`. The
// app's read-only ethers JsonRpcProvider connects DIRECTLY to each selectable
// network's RPC URL (reads when no wallet is connected, or when the wallet is
// on a different chain than the one being read). If an RPC host is missing from
// connect-src the provider can't detect the network and every read fails with
// "Refused to connect because it violates the document's Content Security
// Policy" — which is exactly how the Mordor network broke in production.
//
// These must match the default `rpcUrl`s in src/config/networks.js and the
// transports in src/wagmi.js. localhost:8545 (Hardhat) is intentionally absent
// from the production policy. Wallet-routed writes go through window.ethereum
// (the wallet's own RPC), so only these read-only endpoints need allowlisting.
//
// Like nginxCameraPolicy.test.js, this asserts BOTH nginx configs stay in sync:
// nginx.conf (frontend/Dockerfile) and nginx.conf.template (root Dockerfile,
// used by the production deploy). The two silently diverged once before.

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIGS = [
  resolve(__dirname, '../../nginx.conf'),
  resolve(__dirname, '../../nginx.conf.template'),
]

// Read-only RPC endpoints the frontend fetches directly (one per selectable
// chain). Keep in sync with NETWORKS[*].rpcUrl in src/config/networks.js and
// the transports in src/wagmi.js.
const REQUIRED_RPCS = [
  'https://rpc-amoy.polygon.technology', // Polygon Amoy (80002)
  'https://polygon-bor-rpc.publicnode.com', // Polygon mainnet (137)
  'https://rpc.mordor.etccooperative.org', // Ethereum Classic Mordor (63)
  'https://etc.rivet.link', // Ethereum Classic mainnet (61)
]

// Gasless infrastructure the SPA POSTs to directly (specs 035/036 + 041). Without these in connect-src
// the browser blocks the fetch and every relayed intent silently falls back to self-submit (and the
// ERC-4337 bundler can't be reached at all) — the gasless path is dead in production despite shipping.
const REQUIRED_GASLESS_HOSTS = [
  'https://relay.fairwins.app', // relay-gateway (VITE_RELAYER_URL) — intent submission + status
  'https://bundler.fairwins.app', // alto ERC-4337 bundler (edge-fronted target, spec 041)
]

describe('nginx CSP connect-src blockchain RPC allowlist', () => {
  it.each(CONFIGS)('%s allowlists every production RPC endpoint', (path) => {
    const conf = readFileSync(path, 'utf8')
    const cspLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    expect(cspLine, `${path} is missing a Content-Security-Policy header`).toBeTruthy()

    // Isolate the connect-src directive so a host listed only under img-src
    // (e.g. an IPFS gateway) can't satisfy the assertion.
    const connectSrc = cspLine.match(/connect-src\s+([^;]*)/)?.[1]
    expect(connectSrc, `${path} CSP has no connect-src directive`).toBeTruthy()

    for (const rpc of REQUIRED_RPCS) {
      expect(
        connectSrc,
        `${path} connect-src is missing ${rpc} — reads on that chain will be blocked by CSP`,
      ).toContain(rpc)
    }

    for (const host of REQUIRED_GASLESS_HOSTS) {
      expect(
        connectSrc,
        `${path} connect-src is missing ${host} — the gasless relay/bundler call will be blocked by CSP`,
      ).toContain(host)
    }

    // The dev-only Hardhat RPC must never ship in the production policy.
    expect(connectSrc).not.toContain('localhost:8545')
    expect(connectSrc).not.toContain('127.0.0.1')
  })
})
