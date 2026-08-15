#!/usr/bin/env node
/**
 * FairWins application exporter (spec 088) — turns the things that have actually broken this estate
 * into Prometheus gauges.
 *
 * Zero dependencies, by design: it runs on the stock `node:22-alpine` image with no install step,
 * so there is no lockfile for it to drift against and no supply chain to audit for a component
 * whose whole job is to be trustworthy about whether things are working.
 *
 * WHAT IT SCRAPES AND WHY EACH ONE EARNED ITS PLACE:
 *
 *   1. The gateway's own /status. It reports per-chain RPC reachability, gas-wallet runway in
 *      hours, and paymaster deposit runway. Runway is the metric that matters: a gas wallet at
 *      "198 hours" is fine and a gas wallet at "4 hours" is an outage that has not happened yet.
 *      Nothing else in the estate exposes that as a number.
 *   2. The bundler's eth_supportedEntryPoints. A plain 200 from the bundler proves NOTHING — the
 *      origin-lock nginx serves its own static 200 that never touches alto, which is exactly the
 *      check that stayed green through the 2026-07-12 stall. Matching the EntryPoint address in
 *      the response is the cheapest probe that actually reaches the application.
 *   3. Chain head and account balances, read from public RPC.
 *
 * THREE RULES THIS FILE KEEPS:
 *
 *   - NO CREDENTIALS. Everything here is readable from a public endpoint. An observability
 *     component holding a secret is a component that can leak one, and it would need one only to
 *     watch things it can already see.
 *   - A FAILED SCRAPE IS A ZERO `_up`, NEVER A MISSING SERIES. A metric that vanishes when the
 *     thing it measures breaks is worse than no metric: `absent()` alerting is easy to forget, and
 *     a dashboard renders the gap as "no data" rather than as a fault.
 *   - NEVER A STALE VALUE PRESENTED AS LIVE. Scrapes happen per request with a hard timeout, so a
 *     hung upstream produces `up 0` on this scrape rather than last scrape's number forever.
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.PORT || 9101)
const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 8000)
const CONFIG_PATH = process.env.TARGETS_FILE || new URL('./targets.json', import.meta.url).pathname

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))

/** Prometheus text-format accumulator. Keeps HELP/TYPE emitted once per metric name, in order. */
class Registry {
  constructor() {
    this.metrics = new Map()
  }

  gauge(name, help, labels, value) {
    if (!this.metrics.has(name)) this.metrics.set(name, { help, type: 'gauge', samples: [] })
    // A non-finite value would render as `NaN`/`Inf`, which Prometheus accepts and a dashboard then
    // draws as a real reading. Drop it instead — the companion _up series carries the failure.
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    this.metrics.get(name).samples.push({ labels, value })
  }

  render() {
    const out = []
    for (const [name, m] of this.metrics) {
      out.push(`# HELP ${name} ${m.help}`)
      out.push(`# TYPE ${name} ${m.type}`)
      for (const s of m.samples) {
        const labels = Object.entries(s.labels)
          .map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
          .join(',')
        out.push(labels ? `${name}{${labels}} ${s.value}` : `${name} ${s.value}`)
      }
    }
    return `${out.join('\n')}\n`
  }
}

/** fetch with a hard timeout, so one hung upstream cannot stall the whole scrape. */
async function withTimeout(fn) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    return await fn(ac.signal)
  } finally {
    clearTimeout(t)
  }
}

async function jsonRpc(url, method, params, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error.message || 'rpc error')
  return body.result
}

// ── collectors ────────────────────────────────────────────────────────────────────────────────

async function collectGateway(reg) {
  const started = Date.now()
  try {
    const status = await withTimeout(async (signal) => {
      const res = await fetch(config.gatewayStatusUrl, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })

    reg.gauge('fairwins_gateway_up', 'Gateway /status answered successfully.', {}, 1)
    reg.gauge(
      'fairwins_gateway_scrape_duration_seconds',
      'Seconds taken to scrape the gateway status endpoint.',
      {},
      (Date.now() - started) / 1000,
    )
    // The kill switch halts every relayed intent. It is operator-set, so it is not a fault — but a
    // dashboard that does not show it turns "we turned it off" into an unexplained outage.
    reg.gauge(
      'fairwins_gateway_killswitch',
      'Relay kill switch: 1 when engaged, which halts every relayed intent.',
      {},
      status.killSwitch ? 1 : 0,
    )

    for (const [chainId, c] of Object.entries(status.chains || {})) {
      const labels = { chain_id: chainId }
      reg.gauge('fairwins_chain_rpc_up', 'Gateway-observed RPC reachability per chain.', labels, c.rpc === 'up' ? 1 : 0)
      reg.gauge(
        'fairwins_gas_wallet_runway_hours',
        'Hours of gas remaining in the relayer gas wallet at current burn. The number that predicts an outage before it happens.',
        labels,
        c.gasWalletRunwayHrs,
      )
      reg.gauge(
        'fairwins_paymaster_deposit_runway_hours',
        'Hours of EntryPoint deposit remaining for the sponsoring paymaster (spec 050). Null where sponsorship is not configured.',
        labels,
        c.paymasterDepositRunwayHrs,
      )
    }
  } catch {
    // Deliberately emitted rather than omitted — see rule 2 at the top of this file.
    reg.gauge('fairwins_gateway_up', 'Gateway /status answered successfully.', {}, 0)
  }
}

async function collectBundler(reg) {
  try {
    const result = await withTimeout((signal) =>
      jsonRpc(config.bundlerRpcUrl, 'eth_supportedEntryPoints', [], signal),
    )
    // Reaching alto, not merely reaching nginx. The origin-lock container answers 200 on its own
    // health path without ever touching the bundler.
    const ok = Array.isArray(result) && result.some((a) => /^0x5FF137D4/i.test(a))
    reg.gauge(
      'fairwins_bundler_up',
      'Bundler answered eth_supportedEntryPoints with EntryPoint v0.6. A plain HTTP 200 does not imply this.',
      {},
      ok ? 1 : 0,
    )
  } catch {
    reg.gauge(
      'fairwins_bundler_up',
      'Bundler answered eth_supportedEntryPoints with EntryPoint v0.6. A plain HTTP 200 does not imply this.',
      {},
      0,
    )
  }
}

async function collectChain(reg, chain) {
  const labels = { chain_id: String(chain.chainId), chain: chain.name }
  const started = Date.now()
  try {
    const hex = await withTimeout((signal) => jsonRpc(chain.rpcUrl, 'eth_blockNumber', [], signal))
    reg.gauge('fairwins_rpc_up', 'Public RPC endpoint answered eth_blockNumber.', labels, 1)
    reg.gauge('fairwins_rpc_block_number', 'Latest block height seen at the public RPC endpoint.', labels, Number(BigInt(hex)))
    reg.gauge('fairwins_rpc_latency_seconds', 'Round-trip time of an eth_blockNumber call.', labels, (Date.now() - started) / 1000)
  } catch {
    reg.gauge('fairwins_rpc_up', 'Public RPC endpoint answered eth_blockNumber.', labels, 0)
    return // balances are read from the same endpoint; there is nothing to try them against
  }

  for (const a of chain.addresses || []) {
    const aLabels = { ...labels, address: a.address, role: a.role }
    try {
      const wei = await withTimeout((signal) => jsonRpc(chain.rpcUrl, 'eth_getBalance', [a.address, 'latest'], signal))
      // Reported in ether as a float. Wei exceeds Number.MAX_SAFE_INTEGER and Prometheus values are
      // float64 regardless, so converting here keeps the loss of precision in one visible place
      // rather than letting it happen silently at ingestion.
      reg.gauge(
        'fairwins_address_balance_ether',
        'Native token balance of a watched account, in whole units.',
        aLabels,
        Number(BigInt(wei)) / 1e18,
      )
      reg.gauge('fairwins_address_readable', 'Balance for this account was read successfully.', aLabels, 1)
    } catch {
      reg.gauge('fairwins_address_readable', 'Balance for this account was read successfully.', aLabels, 0)
    }
  }
}

// ── server ────────────────────────────────────────────────────────────────────────────────────

async function scrape() {
  const reg = new Registry()
  // Collected concurrently: a serial scrape of two chains plus two services would exceed a typical
  // 15s scrape interval the first time any one of them is slow.
  await Promise.all([
    collectGateway(reg),
    collectBundler(reg),
    ...config.chains.map((c) => collectChain(reg, c)),
  ])
  return reg.render()
}

createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end('ok\n')
  }
  if (req.url !== '/metrics') {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('not found\n')
  }
  try {
    const body = await scrape()
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' })
    res.end(body)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(`scrape failed: ${err.message}\n`)
  }
}).listen(PORT, () => {
  process.stdout.write(`fairwins-exporter listening on :${PORT} (targets: ${CONFIG_PATH})\n`)
})
