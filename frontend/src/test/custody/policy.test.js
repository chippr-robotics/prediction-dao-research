// Spec 049 — policy library unit tests (offline). Pure encode/validate/decode/describe logic;
// getPolicyStatus network derivation with a mocked provider; live reads are covered by the
// contract integration suite (test/integration/policy-guard-safe.test.js).

import { describe, it, expect, vi } from 'vitest'
import { Interface, ZeroAddress, getAddress, parseEther, toBeHex, zeroPadValue } from 'ethers'
import {
  GUARD_STORAGE_SLOT,
  NATIVE_ASSET,
  buildEnablePolicySetup,
  buildPolicyChangeTx,
  buildSetGuardTx,
  decodePolicyError,
  describeRules,
  encodeConfigureRules,
  getPolicyEngineAddresses,
  getPolicyStatus,
  guardIface,
  isPolicySupported,
  setupIface,
  summarizeRules,
  validatePolicyConfig,
} from '../../lib/custody/policy'
import { getContractAddressForChain } from '../../config/contracts'

const RECIPIENT = '0x1111111111111111111111111111111111111111'
const TOKEN = getAddress('0x00000000000000000000000000000000000c0ffe')
const VAULT = '0x2222222222222222222222222222222222222222'

// The hardhat sandbox block (1337) carries the synced spec 049 addresses.
const CHAIN = 1337
const guardAddr = getContractAddressForChain('safePolicyGuard', CHAIN)
const setupAddr = getContractAddressForChain('policyGuardSetup', CHAIN)

describe('network gating (FR-013)', () => {
  it('resolves the engine on chains where both contracts are synced', () => {
    expect(guardAddr).toBeTruthy()
    expect(getPolicyEngineAddresses(CHAIN)).toEqual({ guard: getAddress(guardAddr), setup: getAddress(setupAddr) })
    expect(isPolicySupported(CHAIN)).toBe(true)
  })
  it('returns null / unsupported on chains without the engine', () => {
    expect(getPolicyEngineAddresses(80002)).toBeNull()
    expect(isPolicySupported(80002)).toBe(false)
  })
})

describe('validatePolicyConfig (FR-015)', () => {
  it('accepts a full valid config', () => {
    expect(() =>
      validatePolicyConfig({
        limits: [{ asset: NATIVE_ASSET, perTxLimit: parseEther('1'), windowLimit: parseEther('5') }],
        cooldown: 3600,
        allowlistEnabled: true,
        allowlistAdd: [RECIPIENT],
      }),
    ).not.toThrow()
  })
  it('rejects an allowlist enabled with no entries (accidental deny-all)', () => {
    expect(() => validatePolicyConfig({ allowlistEnabled: true })).toThrow(/at least one recipient/i)
  })
  it('rejects a per-tx limit above the window limit (never reachable)', () => {
    expect(() =>
      validatePolicyConfig({ limits: [{ asset: NATIVE_ASSET, perTxLimit: 10n, windowLimit: 5n }] }),
    ).toThrow(/never be reached/i)
  })
  it('rejects cooldowns beyond 365 days, bad addresses, oversized batches, duplicate assets', () => {
    expect(() => validatePolicyConfig({ cooldown: 366 * 24 * 3600 })).toThrow(/365 days/)
    expect(() => validatePolicyConfig({ allowlistAdd: ['nope'] })).toThrow(/Invalid allowlist address/)
    expect(() =>
      validatePolicyConfig({ allowlistAdd: Array.from({ length: 65 }, (_, i) => toBeHex(i + 1, 20)) }),
    ).toThrow(/64/)
    expect(() =>
      validatePolicyConfig({
        limits: [
          { asset: NATIVE_ASSET, perTxLimit: 1n, windowLimit: 0n },
          { asset: ZeroAddress, perTxLimit: 2n, windowLimit: 0n },
        ],
      }),
    ).toThrow(/Duplicate asset/)
  })
})

describe('encodeConfigureRules / buildPolicyChangeTx (US3)', () => {
  const config = {
    limits: [{ asset: TOKEN, perTxLimit: 100n, windowLimit: 500n }],
    cooldown: 60,
    allowlistEnabled: true,
    allowlistAdd: [RECIPIENT],
    allowlistRemove: [],
  }

  it('round-trips through the guard ABI', () => {
    const data = encodeConfigureRules(config)
    const decoded = guardIface.decodeFunctionData('configureRules', data)
    expect(decoded[0]).toHaveLength(1)
    expect(getAddress(decoded[0][0].asset)).toBe(TOKEN)
    expect(decoded[0][0].perTxLimit).toBe(100n)
    expect(decoded[0][0].windowLimit).toBe(500n)
    expect(decoded[1]).toBe(60n)
    expect(decoded[2]).toBe(true)
    expect(decoded[3].map(getAddress)).toEqual([getAddress(RECIPIENT)])
  })

  it('buildPolicyChangeTx targets the guard with zero value (threshold-approved self-tx)', () => {
    const tx = buildPolicyChangeTx(CHAIN, config)
    expect(tx.to).toBe(getAddress(guardAddr))
    expect(tx.value).toBe(0n)
    expect(() => guardIface.decodeFunctionData('configureRules', tx.data)).not.toThrow()
  })

  it('buildSetGuardTx targets the vault itself with the engine guard', () => {
    const tx = buildSetGuardTx(VAULT, CHAIN)
    expect(tx.to).toBe(getAddress(VAULT))
    const decoded = new Interface(['function setGuard(address)']).decodeFunctionData('setGuard', tx.data)
    expect(getAddress(decoded[0])).toBe(getAddress(guardAddr))
  })

  it('throws on unsupported networks instead of building a broken transaction', () => {
    expect(() => buildPolicyChangeTx(80002, config)).toThrow(/not available/)
    expect(() => buildEnablePolicySetup(80002, config)).toThrow(/not available/)
  })
})

describe('buildEnablePolicySetup (US1)', () => {
  it('wraps the configure calldata in an enablePolicy delegatecall payload', () => {
    const { setupTo, setupData } = buildEnablePolicySetup(CHAIN, {
      limits: [{ asset: NATIVE_ASSET, perTxLimit: 1n, windowLimit: 0n }],
    })
    expect(setupTo).toBe(getAddress(setupAddr))
    const decoded = setupIface.decodeFunctionData('enablePolicy', setupData)
    expect(getAddress(decoded[0])).toBe(getAddress(guardAddr))
    const inner = guardIface.decodeFunctionData('configureRules', decoded[1])
    expect(inner[0][0].perTxLimit).toBe(1n)
  })
  it('supports attach-with-no-rules (empty configure calldata)', () => {
    const { setupData } = buildEnablePolicySetup(CHAIN, null)
    const decoded = setupIface.decodeFunctionData('enablePolicy', setupData)
    expect(decoded[1]).toBe('0x')
  })
})

describe('decodePolicyError (FR-011)', () => {
  const enc = (name, args) => guardIface.encodeErrorResult(name, args)

  it('decodes every rule error into a named rule with plain language', () => {
    expect(decodePolicyError(enc('PerTxLimitExceeded', [NATIVE_ASSET, 101n, 100n]))).toMatchObject({
      rule: 'perTxLimit',
      args: { amount: 101n, limit: 100n },
    })
    expect(decodePolicyError(enc('WindowLimitExceeded', [TOKEN, 50n, 10n]))).toMatchObject({
      rule: 'windowLimit',
      args: { attempted: 50n, remaining: 10n },
    })
    expect(decodePolicyError(enc('RecipientNotAllowed', [RECIPIENT]))).toMatchObject({
      rule: 'allowlist',
      args: { recipient: getAddress(RECIPIENT) },
    })
    expect(decodePolicyError(enc('CooldownActive', [1750000000n]))).toMatchObject({
      rule: 'cooldown',
      args: { nextAllowedAt: 1750000000 },
    })
    expect(decodePolicyError(enc('DelegatecallBlocked', [])).rule).toBe('delegatecall')
    expect(decodePolicyError(enc('GasRefundBlocked', [])).rule).toBe('gasRefund')
  })

  it('falls back gracefully on unknown revert data', () => {
    expect(decodePolicyError('0xdeadbeef')).toMatchObject({ rule: 'unknown' })
  })

  it('messages name the violated value (US4 acceptance)', () => {
    const v = decodePolicyError(enc('RecipientNotAllowed', [RECIPIENT]))
    expect(v.message).toMatch(/0x1111…1111/)
    expect(v.message).toMatch(/allowlist/i)
  })
})

describe('describeRules / summarizeRules (US2)', () => {
  const policy = {
    hasRules: true,
    allowlistEnabled: true,
    allowlistCount: 3,
    cooldown: 24 * 3600,
    assetRules: [
      { asset: NATIVE_ASSET, perTxLimit: parseEther('1'), windowLimit: parseEther('5') },
      { asset: TOKEN, perTxLimit: 0n, windowLimit: 0n },
    ],
  }

  it('renders plain-language rules including the window-semantics disclosure (FR-002)', () => {
    const lines = describeRules(policy, { nativeSymbol: 'ETC' })
    expect(lines).toContain('Max 1.0 ETC per transaction')
    expect(lines.find((l) => l.includes('per 24-hour window'))).toMatch(/resets 24 hours later/)
    expect(lines).toContain('Recipients limited to 3 approved addresses')
    expect(lines).toContain('At least 1 day between outgoing transactions')
  })

  it('formats known token metadata and returns empty for no policy', () => {
    const withToken = {
      ...policy,
      assetRules: [{ asset: TOKEN, perTxLimit: 500000000n, windowLimit: 0n }],
    }
    const lines = describeRules(withToken, { assetMeta: { [TOKEN]: { symbol: 'USDC', decimals: 6 } } })
    expect(lines[0]).toBe('Max 500.0 USDC per transaction')
    expect(describeRules(null)).toEqual([])
    expect(describeRules({ hasRules: false })).toEqual([])
  })

  it('summarizes for the vault-list badge', () => {
    expect(summarizeRules(policy)).toBe('limits on 1 asset · 3-address allowlist · 1 day delay')
    expect(summarizeRules(null)).toBe('')
  })
})

describe('getPolicyStatus (US2 / edge cases)', () => {
  const slotValue = (addr) => zeroPadValue(addr, 32)
  const providerWith = (guardAtSlot) => ({
    getStorage: vi.fn(async (vault, slot) => {
      expect(slot).toBe(GUARD_STORAGE_SLOT)
      return slotValue(guardAtSlot)
    }),
  })

  it("'none' when no guard is set", async () => {
    expect(await getPolicyStatus(VAULT, CHAIN, providerWith(ZeroAddress))).toBe('none')
  })
  it("'managed' when our guard is set", async () => {
    expect(await getPolicyStatus(VAULT, CHAIN, providerWith(guardAddr))).toBe('managed')
  })
  it("'foreign' when another guard is set (unrecognized rules)", async () => {
    expect(await getPolicyStatus(VAULT, CHAIN, providerWith(RECIPIENT))).toBe('foreign')
  })
  it("'unsupported' on networks without the engine — regardless of guard slot, with no RPC (FR-013)", async () => {
    const provider = providerWith(RECIPIENT) // even a set guard reports unsupported here
    expect(await getPolicyStatus(VAULT, 80002, provider)).toBe('unsupported')
    expect(provider.getStorage).not.toHaveBeenCalled()
  })
})
