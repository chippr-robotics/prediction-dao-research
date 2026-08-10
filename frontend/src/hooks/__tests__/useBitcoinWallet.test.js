/**
 * Spec 061 T013/T025 — useBitcoinWallet orchestration hook:
 * availability matrix (contracts/key-derivation-btc.md), unlock → discovery →
 * balances, the send pipeline (locks + pending tracking), degraded states,
 * and relock on account switch. No real WebAuthn: resolveMasterSeed, the
 * gateway client, and persistence are injected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

let walletState
vi.mock('../useWalletManagement', () => ({
  useWallet: () => walletState,
}))

import { useBitcoinWallet, __resetBitcoinWalletForTests } from '../useBitcoinWallet'
import { rememberCredential } from '../../lib/passkey/credentials'
import { addressAt } from '../../lib/bitcoin/derivation'
import { ledgerStore } from '../../lib/bitcoin/wallet'

const ACCOUNT = '0x00000000000000000000000000000000000A11CE'
const OTHER_ACCOUNT = '0x0000000000000000000000000000000000000B0b'
const SEED = new Uint8Array(32).fill(7)
const NET = 'bitcoin-testnet' // chainId 80002 (Amoy) is a testnet → testnet4

// Deterministic fixture addresses from the real derivation lib.
const SEGWIT_0 = addressAt(SEED, { network: NET, type: 'segwit', index: 0 })
const TAPROOT_DEST = addressAt(SEED, { network: NET, type: 'taproot', index: 9 })

const FUNDING_TXID = 'ab'.repeat(32)
const BROADCAST_TXID = 'cd'.repeat(32)

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

function makeGateway({
  utxosByAddress = {},
  stamps = { ok: true, degraded: false, stamps: [] },
  failLookup = false,
} = {}) {
  const state = { confirmed: false }
  return {
    state,
    lookupAddresses: vi.fn(async (networkId, addresses) => {
      if (failLookup) return { ok: false, error: 'upstream_unavailable', stale: true }
      return {
        ok: true,
        tipHeight: 100,
        results: addresses.map((address) => ({
          address,
          confirmedSats: (utxosByAddress[address] ?? []).reduce((s, u) => s + u.valueSats, 0),
          pendingSats: 0,
          utxos: utxosByAddress[address] ?? [],
        })),
      }
    }),
    getStamps: vi.fn(async () => stamps),
    getFees: vi.fn(async () => ({
      ok: true,
      rates: { fast: 20, normal: 10, slow: 2 },
      tipHeight: 100,
    })),
    broadcast: vi.fn(async () => ({ ok: true, txid: BROADCAST_TXID })),
    getTxStatus: vi.fn(async (networkId, txid) => ({
      ok: true,
      found: true,
      txid,
      confirmed: state.confirmed,
      confirmations: state.confirmed ? 1 : 0,
    })),
  }
}

function fundedGateway(overrides = {}) {
  return makeGateway({
    utxosByAddress: {
      [SEGWIT_0]: [{ txid: FUNDING_TXID, vout: 0, valueSats: 100_000, confirmations: 3 }],
    },
    ...overrides,
  })
}

function passkeySession({ address = ACCOUNT, prfCapable = true } = {}) {
  walletState = { address, isConnected: true, loginMethod: 'passkey', chainId: 80002 }
  rememberCredential({ credentialId: 'cred-1', address, publicKey: { x: '0x1', y: '0x2' }, prfCapable })
}

function makeDeps(gateway) {
  return {
    gateway,
    store: ledgerStore(memoryStorage()),
    resolveSeed: vi.fn(async () => SEED.slice()),
    pollIntervalMs: 5,
    pollMaxMs: 2_000,
  }
}

async function unlockHook(deps) {
  const rendered = renderHook(() => useBitcoinWallet(deps))
  await act(async () => {
    const res = await rendered.result.current.unlock()
    expect(res.ok).toBe(true)
  })
  return rendered
}

beforeEach(() => {
  localStorage.clear()
  __resetBitcoinWalletForTests()
})

describe('availability matrix (FR-020 / key-derivation contract)', () => {
  it('is unavailable with an honest reason when disconnected', () => {
    walletState = { address: null, isConnected: false, loginMethod: null, chainId: 80002 }
    const { result } = renderHook(() => useBitcoinWallet(makeDeps(makeGateway())))
    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toMatch(/connect/i)
  })

  it('is unavailable for a non-passkey (injected/WalletConnect) login', () => {
    walletState = { address: ACCOUNT, isConnected: true, loginMethod: 'injected', chainId: 80002 }
    const { result } = renderHook(() => useBitcoinWallet(makeDeps(makeGateway())))
    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toMatch(/passkey/i)
  })

  it('is unavailable on a non-PRF authenticator, with the PRF reason', () => {
    passkeySession({ prfCapable: false })
    const { result } = renderHook(() => useBitcoinWallet(makeDeps(makeGateway())))
    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toMatch(/PRF/i)
  })

  it('is unavailable when the gateway is unconfigured (capability off)', () => {
    passkeySession()
    const gateway = { ...makeGateway(), baseUrl: '' }
    const { result } = renderHook(() => useBitcoinWallet(makeDeps(gateway)))
    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toMatch(/not configured/i)
  })

  it('is locked (not unavailable) for a PRF-capable passkey before unlock', () => {
    passkeySession()
    const { result } = renderHook(() => useBitcoinWallet(makeDeps(makeGateway())))
    expect(result.current.status).toBe('locked')
    expect(result.current.networkId).toBe(NET)
  })
})

describe('unlock → discovery → balances', () => {
  it('resolves the seed once, discovers funded addresses, and populates balances', async () => {
    passkeySession()
    const gateway = fundedGateway()
    const deps = makeDeps(gateway)
    const { result } = await unlockHook(deps)

    expect(deps.resolveSeed).toHaveBeenCalledTimes(1)
    expect(deps.resolveSeed).toHaveBeenCalledWith({ account: ACCOUNT, credentialId: 'cred-1' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(result.current.balances.confirmedSats).toBe(100_000))
    expect(result.current.balances.spendableSats).toBe(100_000)
    expect(result.current.balances.protectedSats).toBe(0)
    expect(result.current.stampsDegraded).toBe(false)

    // Discovery rebuilt the issued-address ledger from chain state (FR-003).
    const issued = deps.store.get(ACCOUNT, NET).issued
    expect(issued.map((a) => a.address)).toContain(SEGWIT_0)
  })

  it('marks state stale (never zero-with-confidence) when the gateway is unreachable', async () => {
    passkeySession()
    const deps = makeDeps(makeGateway({ failLookup: true }))
    const { result } = await unlockHook(deps)
    await waitFor(() => expect(result.current.stale).toBe(true))
    expect(result.current.status).toBe('ready')
  })

  it('fails safe when stamps recognition is degraded: all coins protected, none spendable', async () => {
    passkeySession()
    const deps = makeDeps(fundedGateway({ stamps: { ok: true, degraded: true, stamps: [] } }))
    const { result } = await unlockHook(deps)
    await waitFor(() => expect(result.current.stampsDegraded).toBe(true))
    expect(result.current.balances.protectedSats).toBe(100_000)
    expect(result.current.balances.spendableSats).toBe(0)
  })

  it('issues fresh, never-repeating receive addresses and formats BIP-21', async () => {
    passkeySession()
    const deps = makeDeps(fundedGateway())
    const { result } = await unlockHook(deps)
    await waitFor(() => expect(result.current.status).toBe('ready'))

    let a
    let b
    act(() => {
      a = result.current.receive.nextReceiveAddress('segwit')
    })
    act(() => {
      b = result.current.receive.nextReceiveAddress('segwit')
    })
    expect(a.address).not.toBe(b.address)
    expect(b.index).toBeGreaterThan(a.index)
    expect(result.current.receive.current.address).toBe(b.address)
    expect(result.current.receive.uri).toBe(`bitcoin:${b.address}`)
  })
})

describe('send pipeline (FR-011…FR-014)', () => {
  async function readySend() {
    passkeySession()
    const gateway = fundedGateway()
    const deps = makeDeps(gateway)
    const rendered = await unlockHook(deps)
    await waitFor(() => expect(rendered.result.current.balances.spendableSats).toBe(100_000))
    await act(async () => {
      const q = await rendered.result.current.send.getFeeQuote()
      expect(q.ok).toBe(true)
    })
    return { ...rendered, gateway, deps }
  }

  it('prepares, signs, broadcasts, locks the coins, and tracks the pending tx to confirmation', async () => {
    const { result, gateway } = await readySend()

    const prep = result.current.send.prepare({
      destination: TAPROOT_DEST,
      amountSats: 20_000,
      feeRate: result.current.send.feeQuote.rates.normal,
    })
    expect(prep.ok).toBe(true)
    expect(prep.plan.destinationType).toBe('p2tr')
    expect(prep.plan.feeSats).toBeGreaterThan(0)
    expect(prep.plan.changeSats).toBeGreaterThan(0)

    let res
    await act(async () => {
      res = await result.current.send.confirmAndSend(prep.plan)
    })
    expect(res.ok).toBe(true)
    expect(res.txid).toBe(BROADCAST_TXID)
    // The fee committed never exceeds the previewed estimate (FR-012).
    expect(res.feeSats).toBeLessThanOrEqual(prep.plan.feeSats)
    expect(gateway.broadcast).toHaveBeenCalledTimes(1)

    // Coins committed to the in-flight send are locked (FR-014)…
    expect(result.current.balances.spendableSats).toBe(0)
    // …and the activity entry is honestly pending, never final early (FR-009).
    expect(result.current.activity[0]).toMatchObject({
      txid: BROADCAST_TXID,
      direction: 'out',
      amountSats: 20_000,
      status: 'pending',
    })

    // Network confirms → polling flips the entry and releases the locks.
    gateway.state.confirmed = true
    await waitFor(() => expect(result.current.activity[0].status).toBe('confirmed'))
    await waitFor(() => expect(result.current.balances.spendableSats).toBe(100_000))
  })

  it('explains a shortfall instead of failing later', async () => {
    const { result } = await readySend()
    const prep = result.current.send.prepare({
      destination: TAPROOT_DEST,
      amountSats: 200_000, // > spendable
      feeRate: 10,
    })
    expect(prep.ok).toBe(false)
    expect(prep.error).toBe('insufficient_funds')
    expect(prep.shortfallSats).toBeGreaterThan(0)
  })

  it('rejects an invalid destination with the specific classifyAddress reason', async () => {
    const { result } = await readySend()
    const prep = result.current.send.prepare({
      destination: '0x00000000000000000000000000000000000A11CE',
      amountSats: 10_000,
      feeRate: 10,
    })
    expect(prep.ok).toBe(false)
    expect(prep.error).toBe('invalid_destination')
    expect(prep.reason).toBe('evm_address')
  })

  it('MAX sends everything spendable net of the fee, with no change output', async () => {
    const { result } = await readySend()
    const prep = result.current.send.prepare({
      destination: TAPROOT_DEST,
      amountSats: 'max',
      feeRate: 10,
    })
    expect(prep.ok).toBe(true)
    expect(prep.plan.isMax).toBe(true)
    expect(prep.plan.changeSats).toBe(0)
    expect(prep.plan.amountSats + prep.plan.feeSats).toBe(100_000)
  })

  it('refuses to send against a stale fee quote (forces a re-quote)', async () => {
    passkeySession()
    const clock = { t: 1_000_000_000 }
    const deps = { ...makeDeps(fundedGateway()), now: () => clock.t }
    const { result } = await unlockHook(deps)
    await waitFor(() => expect(result.current.balances.spendableSats).toBe(100_000))
    await act(async () => {
      const q = await result.current.send.getFeeQuote()
      expect(q.ok).toBe(true)
    })
    const prep = result.current.send.prepare({
      destination: TAPROOT_DEST,
      amountSats: 20_000,
      feeRate: 10,
    })
    expect(prep.ok).toBe(true)

    // Age the pinned quote past the 60s freshness window (FR-012).
    clock.t += 120_000
    let res
    await act(async () => {
      res = await result.current.send.confirmAndSend(prep.plan)
    })
    expect(res).toEqual({ ok: false, error: 'stale_fee_quote' })
  })
})

describe('relock semantics', () => {
  it('locks (and zeroes the session) when the account switches', async () => {
    passkeySession()
    const deps = makeDeps(fundedGateway())
    const { result, rerender } = await unlockHook(deps)
    await waitFor(() => expect(result.current.status).toBe('ready'))

    walletState = { ...walletState, address: OTHER_ACCOUNT }
    rerender()

    await waitFor(() => expect(result.current.status).not.toBe('ready'))
    expect(result.current.balances).toEqual({
      confirmedSats: 0,
      pendingSats: 0,
      protectedSats: 0,
      spendableSats: 0,
    })
    expect(result.current.activity).toEqual([])
    // A new unlock would need a fresh ceremony — the seed is gone.
    expect(result.current.status).toBe('unavailable') // no credential for OTHER_ACCOUNT
  })

  it('locks on disconnect', async () => {
    passkeySession()
    const deps = makeDeps(fundedGateway())
    const { result, rerender } = await unlockHook(deps)
    await waitFor(() => expect(result.current.status).toBe('ready'))

    walletState = { address: null, isConnected: false, loginMethod: null, chainId: 80002 }
    rerender()
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.coins).toEqual([])
  })
})
