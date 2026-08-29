/**
 * x402 collector (spec 089 + 096).
 *
 * THE ONE THING THESE TESTS EXIST FOR: the treasury is shared. The FeeRouter forwards platform fees
 * to the same address x402 pays into, so a collector that counted arrivals would report fee revenue
 * as agent revenue — a real number attributed to the wrong source, which is worse than no number.
 * The discrimination rule (a `Transfer` into the treasury whose transaction ALSO used an EIP-3009
 * authorization) is therefore the behaviour under test, not an implementation detail.
 */
import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { createX402Collector } from '../src/collectors/x402.js'

const TREASURY = '0xcf76db7aa9Fb1BFe08E010468F3344bB45830447'
const TOKEN = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const OTHER = '0x1215185387E70a48b07D73AcB67002A073F18575'

const IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
])

const usdc = (n) => ethers.parseUnits(String(n), 6)

function transferLog({ from = OTHER, to, value, txHash }) {
  const enc = IFACE.encodeEventLog('Transfer', [from, to, value])
  return { ...enc, address: TOKEN, transactionHash: txHash }
}

function authorizationLog({ authorizer = OTHER, nonce = ethers.id('n'), txHash }) {
  const enc = IFACE.encodeEventLog('AuthorizationUsed', [authorizer, nonce])
  return { ...enc, address: TOKEN, transactionHash: txHash }
}

/** Minimal cursor store with the surface the collector uses. */
function cursorStore() {
  const at = new Map()
  const totals = new Map()
  return {
    get: (k, fallback) => at.get(k) ?? fallback,
    set: (k, v) => at.set(k, v),
    accumulate: (k, d) => totals.set(k, (totals.get(k) ?? 0n) + d),
    total: (k) => totals.get(k) ?? 0n,
  }
}

function harness(logs, { payTo = TREASURY, paymentToken = TOKEN, head = 1000 } = {}) {
  const config = {
    x402: { payTo, chainId: 137, paymentToken },
    confirmations: { 137: 0 },
    lookbackBlocks: 500,
  }
  const providers = {
    137: {
      getBlockNumber: async () => head,
      getLogs: async () => logs,
    },
  }
  return createX402Collector({ config, providers, cursors: cursorStore(), log: () => {} })
}

const SOURCE = { id: 'x402-agent-payments', chains: [137] }

describe('x402 collector — telling settlements apart from every other USDC arrival', () => {
  it('counts a transfer into the treasury whose transaction used an authorization', async () => {
    const collect = harness([
      transferLog({ to: TREASURY, value: usdc('0.05'), txHash: '0xaa' }),
      authorizationLog({ txHash: '0xaa' }),
    ])
    const r = await collect(SOURCE)
    expect(r.state).toBe('read')
    expect(r.value).toBeCloseTo(0.05, 9)
    expect(r.unit).toBe('USDC')
  })

  it('IGNORES a plain transfer into the same treasury — this is the FeeRouter forwarding a fee', async () => {
    const collect = harness([transferLog({ to: TREASURY, value: usdc('100'), txHash: '0xbb' })])
    const r = await collect(SOURCE)
    expect(r.state).toBe('read')
    // Counting this would report $100 of fee revenue as agent revenue.
    expect(r.value).toBe(0)
  })

  it('IGNORES an authorization-settled transfer to somewhere else — the intent rail', async () => {
    const collect = harness([
      transferLog({ to: OTHER, value: usdc('7'), txHash: '0xcc' }),
      authorizationLog({ txHash: '0xcc' }),
    ])
    const r = await collect(SOURCE)
    expect(r.value).toBe(0)
  })

  it('does not let an authorization in ONE transaction qualify a plain transfer in ANOTHER', async () => {
    const collect = harness([
      authorizationLog({ txHash: '0xdd' }),
      transferLog({ to: TREASURY, value: usdc('42'), txHash: '0xee' }),
    ])
    const r = await collect(SOURCE)
    expect(r.value).toBe(0)
  })

  it('sums several settlements and keeps a mixed batch honest', async () => {
    const collect = harness([
      transferLog({ to: TREASURY, value: usdc('0.01'), txHash: '0x01' }),
      authorizationLog({ txHash: '0x01' }),
      transferLog({ to: TREASURY, value: usdc('0.10'), txHash: '0x02' }),
      authorizationLog({ txHash: '0x02' }),
      transferLog({ to: TREASURY, value: usdc('500'), txHash: '0x03' }), // a fee arrival
      transferLog({ to: OTHER, value: usdc('9'), txHash: '0x04' }), // not ours
      authorizationLog({ txHash: '0x04' }),
    ])
    const r = await collect(SOURCE)
    expect(r.value).toBeCloseTo(0.11, 9)
  })

  it('reports not-configured — never $0 — when the rail is not offered', async () => {
    const r = await harness([], { payTo: null })(SOURCE)
    expect(r.state).toBe('not-configured')
    expect(r.value).toBeNull()
  })

  it('reports not-configured when the chain records no EIP-3009 token', async () => {
    const r = await harness([], { paymentToken: null })(SOURCE)
    expect(r.state).toBe('not-configured')
  })

  it('reports unreadable — never a smaller-but-plausible number — when the scan fails', async () => {
    const collect = createX402Collector({
      config: { x402: { payTo: TREASURY, chainId: 137, paymentToken: TOKEN }, confirmations: { 137: 0 }, lookbackBlocks: 500 },
      providers: {
        137: {
          getBlockNumber: async () => 1000,
          getLogs: async () => {
            throw new Error('range too wide')
          },
        },
      },
      cursors: cursorStore(),
      log: () => {},
    })
    const r = await collect(SOURCE)
    expect(r.state).toBe('unreadable')
    expect(r.value).toBeNull()
  })
})
