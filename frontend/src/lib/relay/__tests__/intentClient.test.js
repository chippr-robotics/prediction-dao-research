/**
 * Shared intent-relay client tests (specs 035 + 036).
 *
 * Covers: makeRelayer's dormant-safe null (VITE_RELAYER_URL unset), signIntent's gateway-Intent body
 * shape for both intent classes, the FR-020 pre-sign stablecoin-domain check (PaymentUnsupportedOnChain
 * before ANY wallet prompt), and relayIntent's typed error contract (RelayerUnavailable on
 * 429/503/network error vs RelayRejected with the gateway's error.code). global.fetch is mocked in
 * src/test/setup.js; we override it per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRelayer, signIntent, relayIntent, pollStatus, probeHealth, randomNonce } from '../intentClient'
import { PaymentUnsupportedOnChain, RelayRejected, RelayerUnavailable } from '../errors'
import { stablecoinDomain, wagerRegistryDomain, membershipManagerDomain } from '../intentTypes'

const RELAYER_URL = 'https://relayer.fairwins.example'
const REGISTRY = '0x00000000000000000000000000000000000000aa'
const SIGNER_ADDRESS = '0x00000000000000000000000000000000000000bb'

/** Minimal ethers-signer stub capturing every signTypedData call. */
function makeSigner() {
  const calls = []
  return {
    calls,
    getAddress: async () => SIGNER_ADDRESS,
    signTypedData: async (domain, types, message) => {
      calls.push({ domain, types, message })
      // A structurally valid 65-byte signature so ethers.Signature.from can parse it (EIP-3009 leg).
      return '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b'
    },
  }
}

describe('intent relay client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('makeRelayer', () => {
    it('returns null when VITE_RELAYER_URL is unset (gasless disabled — every flow self-submits)', () => {
      vi.stubEnv('VITE_RELAYER_URL', '')
      expect(makeRelayer(137)).toBeNull()
    })

    it('returns a chain-bound handle when configured', () => {
      vi.stubEnv('VITE_RELAYER_URL', `${RELAYER_URL}/`)
      const relayer = makeRelayer(137)
      expect(relayer).not.toBeNull()
      expect(relayer.chainId).toBe(137)
      expect(relayer.baseUrl).toBe(RELAYER_URL) // trailing slash trimmed
      expect(typeof relayer.relayIntent).toBe('function')
      expect(typeof relayer.pollStatus).toBe('function')
      expect(typeof relayer.probeHealth).toBe('function')
    })
  })

  describe('domain builders', () => {
    it('builds the per-contract FairWins domains (network + contract isolation, FR-005/FR-021)', () => {
      expect(wagerRegistryDomain(137, REGISTRY)).toEqual({
        name: 'FairWins WagerRegistry',
        version: '1',
        chainId: 137,
        verifyingContract: REGISTRY,
      })
      expect(membershipManagerDomain(80002, REGISTRY)).toEqual({
        name: 'FairWins MembershipManager',
        version: '1',
        chainId: 80002,
        verifyingContract: REGISTRY,
      })
    })

    it('builds the stablecoin domain from networks.js domainVersion (native Circle USDC = "2")', () => {
      const domain = stablecoinDomain(137)
      expect(domain.name).toBe('USD Coin')
      expect(domain.version).toBe('2')
      expect(domain.chainId).toBe(137)
    })

    it('throws PaymentUnsupportedOnChain for Mordor USC (domainVersion null, FR-020)', () => {
      expect(() => stablecoinDomain(63)).toThrow(PaymentUnsupportedOnChain)
      expect(() => stablecoinDomain(61)).toThrow(PaymentUnsupportedOnChain)
      try {
        stablecoinDomain(63)
      } catch (e) {
        expect(e.code).toBe('payment_unsupported_on_chain')
        expect(e.chainId).toBe(63)
      }
    })
  })

  describe('signIntent', () => {
    it('builds a signer-attributed Intent body with the gateway shape', async () => {
      const signer = makeSigner()
      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'claimPayout',
        targetContract: REGISTRY,
        params: { wagerId: 7n },
        nowSeconds: 1_000_000,
        validitySeconds: 600,
      })

      expect(intent.intentClass).toBe('signer-attributed')
      expect(intent.chainId).toBe(137)
      expect(intent.targetContract).toBe(REGISTRY)
      expect(intent.action).toBe('claimPayout')
      expect(intent.signature).toMatch(/^0x/)
      expect(intent.fundingMode).toBe('sponsored')
      expect(intent.validAfter).toBe(0)
      expect(intent.validBefore).toBe(1_000_600)
      expect(intent.uniquenessMarker).toMatch(/^0x[0-9a-f]{64}$/)
      expect(intent.authorization).toBeUndefined()
      // Params carry the signed struct (bigints JSON-safe) with the actor auto-bound to the wallet.
      expect(intent.params).toEqual({
        wagerId: '7',
        claimant: SIGNER_ADDRESS,
        nonce: intent.uniquenessMarker,
        validAfter: 0,
        validBefore: 1_000_600,
      })

      // Exactly one wallet prompt, under the WagerRegistry domain with the ClaimPayoutIntent struct.
      expect(signer.calls).toHaveLength(1)
      const call = signer.calls[0]
      expect(call.domain).toEqual(wagerRegistryDomain(137, REGISTRY))
      expect(Object.keys(call.types)).toEqual(['ClaimPayoutIntent'])
      expect(call.message.claimant).toBe(SIGNER_ADDRESS)
      expect(call.message.nonce).toBe(intent.uniquenessMarker)
    })

    it('staples the EIP-3009 authorization to a payment-class intent (paymentNonce binding, FR-007)', async () => {
      const signer = makeSigner()
      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'purchaseTier',
        targetContract: REGISTRY,
        params: { role: '0x' + 'ab'.repeat(32), tier: 2, acceptedTermsHash: '0x' + 'cd'.repeat(32) },
        payment: { value: 25_000_000n },
        fundingMode: 'fee-netted',
        maxFee: 100_000n,
        nowSeconds: 1_000_000,
      })

      expect(intent.intentClass).toBe('payment')
      expect(intent.fundingMode).toBe('fee-netted')
      expect(intent.maxFee).toBe('100000')
      // Money leg: recipient-bound to the target contract, nonce == the struct's paymentNonce.
      expect(intent.authorization).toMatchObject({
        from: SIGNER_ADDRESS,
        to: REGISTRY,
        value: '25000000',
      })
      expect(intent.authorization.v).toBeTypeOf('number')
      expect(intent.params.paymentNonce).toBe(intent.authorization.nonce)
      // ONE marker per payment intent (spec 036 data-model: the uniquenessMarker IS the EIP-3009
      // nonce) — the gateway rejects payment intents where these differ.
      expect(intent.params.paymentNonce).toBe(intent.uniquenessMarker)

      // Two signatures: EIP-3009 under the TOKEN's domain (version '2'), intent under the manager's.
      expect(signer.calls).toHaveLength(2)
      expect(signer.calls[0].domain.version).toBe('2')
      expect(signer.calls[0].domain.name).toBe('USD Coin')
      expect(Object.keys(signer.calls[0].types)).toEqual(['ReceiveWithAuthorization'])
      expect(signer.calls[1].domain).toEqual(membershipManagerDomain(137, REGISTRY))
      expect(Object.keys(signer.calls[1].types)).toEqual(['PurchaseTierIntent'])
    })

    it('rejects payment-class intents on Mordor BEFORE any wallet prompt (FR-020 pre-sign check)', async () => {
      const signer = makeSigner()
      await expect(
        signIntent({
          signer,
          chainId: 63,
          action: 'createWager',
          targetContract: REGISTRY,
          params: {},
          payment: { value: 1_000_000n },
        })
      ).rejects.toBeInstanceOf(PaymentUnsupportedOnChain)
      expect(signer.calls).toHaveLength(0) // no signature was requested
    })

    it('requires an explicit verifier for invalidateNonce (both contracts expose it)', async () => {
      const signer = makeSigner()
      await expect(
        signIntent({ signer, chainId: 137, action: 'invalidateNonce', targetContract: REGISTRY, params: { nonce: randomNonce() } })
      ).rejects.toThrow(/verifier/)

      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'invalidateNonce',
        targetContract: REGISTRY,
        verifier: 'wagerRegistry',
        params: { nonce: '0x' + '55'.repeat(32) },
        nowSeconds: 1_000_000,
      })
      expect(Object.keys(signer.calls[0].types)).toEqual(['InvalidateNonce'])
      expect(intent.params.signer).toBe(SIGNER_ADDRESS)
    })
  })

  describe('relayIntent', () => {
    const intentBody = { intentClass: 'signer-attributed', chainId: 137, action: 'claimPayout' }

    it('POSTs to /v1/intents and returns the accepted envelope', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: { get: () => null },
        json: async () => ({ intentId: 'in_1', status: 'queued' }),
      })
      globalThis.fetch = fetchMock

      const res = await relayIntent(intentBody)
      expect(res).toEqual({ intentId: 'in_1', status: 'queued' })
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe(`${RELAYER_URL}/v1/intents`)
      expect(opts.method).toBe('POST')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toMatchObject(intentBody)
    })

    it('throws RelayerUnavailable when no relayer is configured', async () => {
      vi.stubEnv('VITE_RELAYER_URL', '')
      await expect(relayIntent(intentBody)).rejects.toBeInstanceOf(RelayerUnavailable)
    })

    it('throws RelayerUnavailable on 429 back-pressure (with Retry-After)', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: (h) => (h === 'Retry-After' ? '30' : null) },
        json: async () => ({ error: { code: 'quota_exceeded', reason: 'per-signer quota reached' } }),
      })
      const err = await relayIntent(intentBody).catch((e) => e)
      expect(err).toBeInstanceOf(RelayerUnavailable)
      expect(err.code).toBe('quota_exceeded')
      expect(err.status).toBe(429)
      expect(err.retryAfterSeconds).toBe(30)
    })

    it('throws RelayerUnavailable on 503 (kill switch / screening outage / chain down)', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => ({ error: { code: 'killswitch_active', reason: 'relaying paused' } }),
      })
      const err = await relayIntent(intentBody).catch((e) => e)
      expect(err).toBeInstanceOf(RelayerUnavailable)
      expect(err.code).toBe('killswitch_active')
    })

    it('throws RelayerUnavailable on a network error', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(relayIntent(intentBody)).rejects.toBeInstanceOf(RelayerUnavailable)
    })

    it('throws RelayRejected with the gateway error.code on validation failures', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({ error: { code: 'param_binding_mismatch', reason: 'params do not match signature' } }),
      })
      const err = await relayIntent(intentBody).catch((e) => e)
      expect(err).toBeInstanceOf(RelayRejected)
      expect(err).not.toBeInstanceOf(RelayerUnavailable)
      expect(err.code).toBe('param_binding_mismatch')
      expect(err.reason).toMatch(/do not match/)
    })
  })

  describe('pollStatus / probeHealth', () => {
    it('GETs intent status by id', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ intentId: 'in_1', status: 'confirmed', txHash: '0xdead' }),
      })
      globalThis.fetch = fetchMock
      const res = await pollStatus('in_1')
      expect(res).toEqual({ intentId: 'in_1', status: 'confirmed', txHash: '0xdead' })
      expect(fetchMock.mock.calls[0][0]).toBe(`${RELAYER_URL}/v1/intents/in_1`)
    })

    it('probeHealth is true only for an ok, kill-switch-off gateway with the chain RPC up', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', killSwitch: false, chains: { 137: { rpc: 'up' }, 80002: { rpc: 'down' } } }),
      })
      await expect(probeHealth(137)).resolves.toBe(true)
      await expect(probeHealth(80002)).resolves.toBe(false)
    })

    it('probeHealth is false (never throws) on kill switch, error, or unset relayer', async () => {
      vi.stubEnv('VITE_RELAYER_URL', RELAYER_URL)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', killSwitch: true }),
      })
      await expect(probeHealth(137)).resolves.toBe(false)

      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(probeHealth(137)).resolves.toBe(false)

      vi.stubEnv('VITE_RELAYER_URL', '')
      await expect(probeHealth(137)).resolves.toBe(false)
    })
  })
})
