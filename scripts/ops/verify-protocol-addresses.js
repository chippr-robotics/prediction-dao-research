#!/usr/bin/env node
/**
 * verify-protocol-addresses.js (spec 067, T012 — the research R4b guard)
 *
 * Asserts that every external protocol address spec 067 configures for a network actually carries
 * bytecode ON THAT NETWORK.
 *
 * Why this exists
 * ---------------
 * Uniswap's own deployment docs warn integrators: "you should no longer assume that they are
 * deployed to the same addresses across chains and be extremely careful to confirm mappings." That
 * warning is load-bearing here — Base's UniswapV3Factory and NonfungiblePositionManager live at
 * DIFFERENT addresses than the set Ethereum, Polygon, Arbitrum and Optimism share.
 *
 * Copying a canonical address to Base yields, at best, a revert on the first deposit; at worst a
 * same-address contract belonging to something else entirely. `eth_getCode` is a cheap, definitive
 * check, so there is no reason to run on trust.
 *
 * Usage
 * -----
 *   node scripts/ops/verify-protocol-addresses.js                # every configured network
 *   node scripts/ops/verify-protocol-addresses.js --chain 8453   # one network
 *   node scripts/ops/verify-protocol-addresses.js --json         # machine-readable
 *
 * Exits non-zero if any configured address is missing bytecode, so it can gate a deploy.
 * `scripts/deploy/deploy-bridge-liquidity.js` runs the same assertion before writing any
 * deployment record.
 *
 * Reads RPC endpoints from the environment when present (VITE_RPC_URL_* / <CHAIN>_RPC_URL),
 * otherwise falls back to the same public nodes config/networks.js defaults to.
 */

/* eslint-disable no-console */

// Mirrors frontend/src/config/networks.js. Kept as a plain literal because this script must run
// under bare node (no Vite / import.meta.env), and because an ops guard that imported the very
// config it is checking could be fooled by a bad import.
const TARGETS = {
  1: {
    name: 'Ethereum',
    rpc: ['VITE_RPC_URL_MAINNET', 'MAINNET_RPC_URL'],
    fallbackRpc: 'https://ethereum-rpc.publicnode.com',
    addresses: {
      'across.spokePool': '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
      'across.hubPool': '0xc186fA914353c44b2E33eBE05f21846F1048bEda',
      'uniswap.factory': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      'uniswap.positionManager': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      'token.usdc': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'token.wnative': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  },
  10: {
    name: 'Optimism',
    rpc: ['VITE_RPC_URL_OPTIMISM', 'OPTIMISM_RPC_URL'],
    fallbackRpc: 'https://optimism-rpc.publicnode.com',
    addresses: {
      'across.spokePool': '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
      'uniswap.factory': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      'uniswap.positionManager': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      'token.usdc': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      'token.wnative': '0x4200000000000000000000000000000000000006',
    },
  },
  137: {
    name: 'Polygon',
    rpc: ['VITE_RPC_URL_POLYGON', 'POLYGON_RPC_URL'],
    fallbackRpc: 'https://polygon-bor-rpc.publicnode.com',
    addresses: {
      'across.spokePool': '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
      'uniswap.factory': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      'uniswap.positionManager': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      'token.usdc': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      'token.wnative': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    },
  },
  8453: {
    name: 'Base',
    rpc: ['VITE_RPC_URL_BASE', 'BASE_RPC_URL'],
    fallbackRpc: 'https://base-rpc.publicnode.com',
    // ⚠️ Base's Uniswap addresses are NOT the canonical ones. This is the case the script exists for.
    addresses: {
      'across.spokePool': '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
      'uniswap.factory': '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      'uniswap.positionManager': '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
      'token.usdc': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'token.wnative': '0x4200000000000000000000000000000000000006',
    },
  },
  42161: {
    name: 'Arbitrum One',
    rpc: ['VITE_RPC_URL_ARBITRUM', 'ARBITRUM_RPC_URL'],
    fallbackRpc: 'https://arbitrum-one-rpc.publicnode.com',
    addresses: {
      'across.spokePool': '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
      'uniswap.factory': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      'uniswap.positionManager': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      'token.usdc': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      'token.wnative': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
  },
}

/**
 * Addresses that must be UNIQUE to their chain. Any address appearing on more than one chain in the
 * canonical set is fine (Uniswap really does reuse addresses on four of the five); this catches the
 * inverse mistake — a Base-specific address pasted onto another chain, or vice versa.
 */
const CHAIN_SPECIFIC = {
  8453: ['uniswap.factory', 'uniswap.positionManager'],
}

/**
 * An endpoint safe to print.
 *
 * RPC URLs in this project routinely carry credentials — QuickNode and Alchemy embed the API key in
 * the PATH, others use a query parameter — and this script's output goes to stdout, into CI logs,
 * and into terminal transcripts people paste into issues. Printing the resolved URL verbatim leaked
 * a live key every time it ran against a keyed endpoint. Host only: enough to tell which provider
 * answered, with nothing worth stealing.
 */
function safeRpcLabel(rpcUrl) {
  try {
    const u = new URL(rpcUrl)
    // A path or query beyond "/" is where the credential lives, so say it exists without showing it.
    const hasSecret = (u.pathname && u.pathname !== '/') || u.search !== ''
    return `${u.protocol}//${u.host}${hasSecret ? '/…' : ''}`
  } catch {
    // Not parseable as a URL — say nothing rather than risk echoing a raw secret.
    return '(unparseable endpoint)'
  }
}

function resolveRpc(target) {
  for (const key of target.rpc) {
    if (process.env[key]) return process.env[key]
  }
  return target.fallbackRpc
}

async function getCode(rpcUrl, address) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${safeRpcLabel(rpcUrl)}`)
  const body = await res.json()
  if (body.error) throw new Error(`RPC error: ${JSON.stringify(body.error)}`)
  return body.result
}

async function verifyChain(chainId, target) {
  const rpcUrl = resolveRpc(target)
  const results = []
  for (const [label, address] of Object.entries(target.addresses)) {
    try {
      const code = await getCode(rpcUrl, address)
      const bytes = code && code !== '0x' ? (code.length - 2) / 2 : 0
      results.push({ chainId, label, address, bytes, ok: bytes > 0, error: null })
    } catch (err) {
      // A transport failure is NOT a pass. Report it as a failure so a flaky RPC can never be
      // mistaken for a verified address.
      results.push({ chainId, label, address, bytes: 0, ok: false, error: err.message })
    }
  }
  return results
}

function checkCrossChainLeaks(all) {
  const problems = []
  for (const [chainIdStr, labels] of Object.entries(CHAIN_SPECIFIC)) {
    const chainId = Number(chainIdStr)
    for (const label of labels) {
      const own = all.find((r) => r.chainId === chainId && r.label === label)
      if (!own) continue
      const leaked = all.filter(
        (r) => r.chainId !== chainId && r.address.toLowerCase() === own.address.toLowerCase()
      )
      for (const l of leaked) {
        problems.push(
          `${label} ${own.address} is Base-specific but is also configured on chain ${l.chainId}`
        )
      }
    }
  }
  return problems
}

async function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const chainArgIdx = args.indexOf('--chain')
  const only = chainArgIdx >= 0 ? Number(args[chainArgIdx + 1]) : null

  const entries = Object.entries(TARGETS).filter(([id]) => only == null || Number(id) === only)
  if (entries.length === 0) {
    console.error(`No configured network for --chain ${only}. Known: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(2)
  }

  const all = []
  for (const [id, target] of entries) {
    const results = await verifyChain(Number(id), target)
    all.push(...results)
    if (!asJson) {
      console.log(`\n${target.name} (${id}) via ${safeRpcLabel(resolveRpc(target))}`)
      for (const r of results) {
        const status = r.ok ? `OK ${String(r.bytes).padStart(6)} bytes` : `FAIL ${r.error || 'no bytecode'}`
        console.log(`  ${r.label.padEnd(26)} ${r.address}  ${status}`)
      }
    }
  }

  const failures = all.filter((r) => !r.ok)
  const leaks = checkCrossChainLeaks(all)

  if (asJson) {
    console.log(JSON.stringify({ results: all, failures, leaks }, null, 2))
  } else {
    if (leaks.length) {
      console.log('\nCross-chain address leaks:')
      for (const l of leaks) console.log(`  ${l}`)
    }
    console.log(
      `\n${all.length - failures.length}/${all.length} addresses carry bytecode on their own chain.`
    )
    if (failures.length === 0 && leaks.length === 0) {
      console.log('All configured protocol addresses verified.')
    }
  }

  if (failures.length || leaks.length) process.exit(1)
}

main().catch((err) => {
  console.error(`verify-protocol-addresses failed: ${err.message}`)
  process.exit(2)
})
