/**
 * useIntentAction tests — the never-stranded rule and honest status machine (spec 035 FR-014/FR-018).
 *
 * intentClient is mocked at the module boundary (makeRelayer) so the hook's routing decisions are
 * exercised directly: relayer unset → selfSubmit; RelayerUnavailable / PaymentUnsupportedOnChain →
 * selfSubmit; and 'confirmed' is NEVER shown before a txHash-bearing confirmed relay status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { PaymentUnsupportedOnChain, RelayerUnavailable } from '../errors'

const h = vi.hoisted(() => ({
  makeRelayer: vi.fn(),
}))
vi.mock('../intentClient', () => ({
  makeRelayer: h.makeRelayer,
}))

import { useIntentAction, INTENT_STATUS, makeIntentActivityEntry } from '../useIntentAction'

const SAMPLE_INTENT = {
  intentClass: 'signer-attributed',
  chainId: 137,
  action: 'claimPayout',
  uniquenessMarker: '0x' + 'aa'.repeat(32),
  validBefore: Math.floor(Date.now() / 1000) + 3600,
}

/** A healthy relayer handle whose relay/poll behavior each test scripts. */
function makeRelayerHandle({ relayIntent, pollStatus, probeHealth } = {}) {
  return {
    chainId: 137,
    baseUrl: 'https://relayer.fairwins.example',
    probeHealth: probeHealth || vi.fn().mockResolvedValue(true),
    relayIntent: relayIntent || vi.fn(),
    pollStatus: pollStatus || vi.fn(),
  }
}

describe('useIntentAction', () => {
  beforeEach(() => {
    h.makeRelayer.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws at wiring time when selfSubmit is missing (never-stranded rule)', () => {
    // React logs the render error before rethrowing — keep the test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      renderHook(() => useIntentAction({ action: 'claimPayout', chainId: 137, buildIntent: async () => SAMPLE_INTENT }))
    ).toThrow(/selfSubmit is required/)
    consoleError.mockRestore()
  })

  it('falls back to selfSubmit when the relayer is unset, confirming only on the mined receipt', async () => {
    h.makeRelayer.mockReturnValue(null) // VITE_RELAYER_URL unset
    const buildIntent = vi.fn()
    const selfSubmit = vi.fn().mockResolvedValue({ hash: '0xself' })
    const { result } = renderHook(() =>
      useIntentAction({ action: 'claimPayout', chainId: 137, buildIntent, selfSubmit })
    )

    let out
    await act(async () => {
      out = await result.current.run(7)
    })

    expect(selfSubmit).toHaveBeenCalledWith(7)
    expect(buildIntent).not.toHaveBeenCalled() // no wasted signature when gasless is off
    expect(out).toMatchObject({ via: 'self-submit', reason: 'relayer-unset', txHash: '0xself' })
    expect(result.current.status).toBe(INTENT_STATUS.CONFIRMED)
    expect(result.current.result.txHash).toBe('0xself')
  })

  it('falls back to selfSubmit when relayIntent throws RelayerUnavailable (429/503/timeout)', async () => {
    const relayer = makeRelayerHandle({
      relayIntent: vi.fn().mockRejectedValue(new RelayerUnavailable('busy', { code: 'backpressure', status: 429 })),
    })
    h.makeRelayer.mockReturnValue(relayer)
    const selfSubmit = vi.fn().mockResolvedValue({ transactionHash: '0xfallback' })
    const { result } = renderHook(() =>
      useIntentAction({ action: 'claimPayout', chainId: 137, buildIntent: async () => SAMPLE_INTENT, selfSubmit })
    )

    await act(async () => {
      await result.current.run()
    })

    expect(relayer.relayIntent).toHaveBeenCalled()
    expect(selfSubmit).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe(INTENT_STATUS.CONFIRMED)
    expect(result.current.result).toMatchObject({ via: 'self-submit', reason: 'backpressure', txHash: '0xfallback' })
  })

  it('falls back to selfSubmit when the health probe fails, before requesting a signature (FR-016)', async () => {
    const buildIntent = vi.fn()
    const relayer = makeRelayerHandle({ probeHealth: vi.fn().mockResolvedValue(false) })
    h.makeRelayer.mockReturnValue(relayer)
    const selfSubmit = vi.fn().mockResolvedValue('0xdirect')
    const { result } = renderHook(() =>
      useIntentAction({ action: 'declareDraw', chainId: 137, buildIntent, selfSubmit })
    )

    await act(async () => {
      await result.current.run()
    })

    expect(buildIntent).not.toHaveBeenCalled()
    expect(selfSubmit).toHaveBeenCalled()
    expect(result.current.result).toMatchObject({ via: 'self-submit', reason: 'relayer-unhealthy' })
  })

  it('falls back to selfSubmit when buildIntent throws PaymentUnsupportedOnChain (Mordor, FR-020)', async () => {
    h.makeRelayer.mockReturnValue(makeRelayerHandle())
    const buildIntent = vi.fn().mockRejectedValue(new PaymentUnsupportedOnChain('USC lacks EIP-3009', { chainId: 63 }))
    const selfSubmit = vi.fn().mockResolvedValue({ hash: '0xown-gas' })
    const { result } = renderHook(() =>
      useIntentAction({ action: 'createWager', chainId: 63, buildIntent, selfSubmit })
    )

    await act(async () => {
      await result.current.run()
    })

    expect(selfSubmit).toHaveBeenCalled()
    expect(result.current.result).toMatchObject({ via: 'self-submit', reason: 'payment-unsupported', txHash: '0xown-gas' })
  })

  it("never shows 'confirmed' before a txHash-bearing confirmed status (FR-018/SC-007)", async () => {
    // Manually-resolved poll promises make every intermediate state observable (no timer races).
    const pollResolvers = []
    const pollStatus = vi.fn(() => new Promise((resolve) => pollResolvers.push(resolve)))
    const relayer = makeRelayerHandle({
      relayIntent: vi.fn().mockResolvedValue({ intentId: 'in_1', status: 'submitted' }),
      pollStatus,
    })
    h.makeRelayer.mockReturnValue(relayer)
    const activity = []
    const { result } = renderHook(() =>
      useIntentAction({
        action: 'claimPayout',
        chainId: 137,
        buildIntent: async () => SAMPLE_INTENT,
        selfSubmit: vi.fn(),
        onActivity: (entry) => activity.push(entry),
        pollIntervalMs: 0,
      })
    )

    let outPromise
    act(() => {
      outPromise = result.current.run()
    })
    // Relay accepted with status 'submitted' (no txHash) → honestly PENDING, not confirmed.
    await waitFor(() => expect(result.current.status).toBe(INTENT_STATUS.PENDING))
    await waitFor(() => expect(pollResolvers.length).toBe(1))

    // Poll #1 still 'submitted' → stays pending.
    await act(async () => {
      pollResolvers[0]({ intentId: 'in_1', status: 'submitted' })
    })
    await waitFor(() => expect(pollResolvers.length).toBe(2))
    expect(result.current.status).toBe(INTENT_STATUS.PENDING)

    // Poll #2 claims 'confirmed' WITHOUT a txHash → must NOT render confirmed.
    await act(async () => {
      pollResolvers[1]({ intentId: 'in_1', status: 'confirmed' })
    })
    await waitFor(() => expect(pollResolvers.length).toBe(3))
    expect(result.current.status).toBe(INTENT_STATUS.PENDING)

    // Poll #3 carries the mined txHash → NOW it is confirmed.
    let out
    await act(async () => {
      pollResolvers[2]({ intentId: 'in_1', status: 'confirmed', txHash: '0xmined' })
      out = await outPromise
    })
    expect(result.current.status).toBe(INTENT_STATUS.CONFIRMED)
    expect(out).toMatchObject({ via: 'relay', intentId: 'in_1', txHash: '0xmined' })

    // Spec-031 entries at submitted → confirmed, in order, honest types.
    expect(activity.map((e) => e.type)).toEqual(['intent-submitted', 'intent-confirmed'])
    expect(activity[1].txHash).toBe('0xmined')
    expect(activity.every((e) => e.domain === 'intents')).toBe(true)
  })

  it('marks the intent failed (keeping self-submit available) when the gateway reports failure', async () => {
    const relayer = makeRelayerHandle({
      relayIntent: vi.fn().mockResolvedValue({ intentId: 'in_2', status: 'submitted' }),
      pollStatus: vi.fn().mockResolvedValue({ intentId: 'in_2', status: 'failed', reason: 'reverted' }),
    })
    h.makeRelayer.mockReturnValue(relayer)
    const selfSubmit = vi.fn().mockResolvedValue({ hash: '0xretry' })
    const activity = []
    const { result } = renderHook(() =>
      useIntentAction({
        action: 'acceptWager',
        chainId: 137,
        buildIntent: async () => SAMPLE_INTENT,
        selfSubmit,
        onActivity: (entry) => activity.push(entry),
        pollIntervalMs: 0,
      })
    )

    await act(async () => {
      await result.current.run()
    })
    expect(result.current.status).toBe(INTENT_STATUS.FAILED)
    expect(result.current.error.message).toMatch(/reverted/)
    expect(activity.map((e) => e.type)).toEqual(['intent-submitted', 'intent-failed'])

    // The user can still choose "Pay my own gas" — never stranded.
    await act(async () => {
      await result.current.selfSubmitNow()
    })
    expect(selfSubmit).toHaveBeenCalled()
    expect(result.current.status).toBe(INTENT_STATUS.CONFIRMED)
  })

  it('invalidate() sends invalidateNonce for a signed-but-unsubmitted intent (FR-006)', async () => {
    const relayer = makeRelayerHandle({
      relayIntent: vi.fn().mockRejectedValue(Object.assign(new Error('rejected'), { name: 'RelayRejected', code: 'expired' })),
    })
    h.makeRelayer.mockReturnValue(relayer)
    const write = vi.fn().mockResolvedValue({ hash: '0xinv' })
    const activity = []
    const { result } = renderHook(() =>
      useIntentAction({
        action: 'claimPayout',
        chainId: 137,
        buildIntent: async () => SAMPLE_INTENT,
        selfSubmit: vi.fn(),
        onActivity: (entry) => activity.push(entry),
      })
    )

    // Relay rejected (a validation verdict, not unavailability) → intent stays unsubmitted.
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.status).toBe(INTENT_STATUS.FAILED)

    await act(async () => {
      await result.current.invalidate(write)
    })
    expect(write).toHaveBeenCalledWith(SAMPLE_INTENT.uniquenessMarker, expect.objectContaining({ uniquenessMarker: SAMPLE_INTENT.uniquenessMarker }))
    expect(result.current.status).toBe(INTENT_STATUS.INVALIDATED)
    expect(activity.some((e) => e.type === 'intent-invalidated')).toBe(true)

    // Once invalidated there is nothing left to invalidate.
    await expect(result.current.invalidate(write)).rejects.toThrow(/no unsubmitted intent/)
  })

  it('makeIntentActivityEntry produces spec-031-shaped entries', () => {
    const entry = makeIntentActivityEntry('confirmed', {
      action: 'purchaseTier',
      chainId: 80002,
      intentId: 'in_9',
      txHash: '0xabc',
      uniquenessMarker: '0x' + 'bb'.repeat(32),
      nowMs: 1234,
    })
    expect(entry).toMatchObject({
      id: `intent:0x${'bb'.repeat(32)}:confirmed`,
      type: 'intent-confirmed',
      domain: 'intents',
      refId: '0x' + 'bb'.repeat(32),
      severity: 'success',
      actionable: false,
      createdAt: 1234,
      read: false,
      chainId: 80002,
      intentId: 'in_9',
      txHash: '0xabc',
    })
    expect(typeof entry.message).toBe('string')
  })
})
