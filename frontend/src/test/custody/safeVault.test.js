// Spec 043 — safeVault unit tests (offline). Pure setup/validation/address-prediction logic plus loadVault's
// not-a-contract path. The live Safe create+load round-trip is exercised by the fork test (T015).

import { describe, it, expect } from 'vitest'
import { AbiCoder, Interface, getAddress, getCreate2Address, keccak256, solidityPackedKeccak256 } from 'ethers'

const coder = AbiCoder.defaultAbiCoder()
import {
  buildSetupInitializer,
  validateVaultConfig,
  computeVaultAddress,
  buildCreateVaultCalldata,
  loadVault,
  isVaultOwner,
} from '../../lib/custody/safeVault'
import { getSafeContracts } from '../../config/safeContracts'
import { SAFE_SETUP_ABI } from '../../abis/SafeProxyFactory'

const O1 = '0x1111111111111111111111111111111111111111'
const O2 = '0x2222222222222222222222222222222222222222'
const O3 = '0x3333333333333333333333333333333333333333'
const FALLBACK = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'

const SETUP_TO = '0x00000000000000000000000000000000000decaf'
const SETUP_DATA = '0x12345678abcd'

describe('buildSetupInitializer', () => {
  it('encodes Safe.setup with owners, threshold, and fallback handler', () => {
    const data = buildSetupInitializer([O1, O2, O3], 2, FALLBACK)
    const decoded = new Interface(SAFE_SETUP_ABI).decodeFunctionData('setup', data)
    expect(decoded[0].map((a) => getAddress(a))).toEqual([O1, O2, O3].map(getAddress))
    expect(decoded[1]).toBe(2n)
    expect(getAddress(decoded[4])).toBe(getAddress(FALLBACK))
  })

  it('stays byte-identical without a policy setup (spec 049 FR-010: omitted, {}, and null defaults)', () => {
    const base = buildSetupInitializer([O1, O2, O3], 2, FALLBACK)
    expect(buildSetupInitializer([O1, O2, O3], 2, FALLBACK, {})).toBe(base)
    expect(buildSetupInitializer([O1, O2, O3], 2, FALLBACK, null)).toBe(base)
    const decoded = new Interface(SAFE_SETUP_ABI).decodeFunctionData('setup', base)
    expect(decoded[2]).toBe(getAddress('0x0000000000000000000000000000000000000000')) // to
    expect(decoded[3]).toBe('0x') // data
  })

  it('threads setupTo/setupData into the encoded setup() args (spec 049 US1)', () => {
    const data = buildSetupInitializer([O1, O2, O3], 2, FALLBACK, { setupTo: SETUP_TO, setupData: SETUP_DATA })
    const decoded = new Interface(SAFE_SETUP_ABI).decodeFunctionData('setup', data)
    expect(getAddress(decoded[2])).toBe(getAddress(SETUP_TO))
    expect(decoded[3]).toBe(SETUP_DATA)
    // Everything else is unchanged relative to the plain initializer.
    expect(decoded[0].map((a) => getAddress(a))).toEqual([O1, O2, O3].map(getAddress))
    expect(decoded[1]).toBe(2n)
    expect(getAddress(decoded[4])).toBe(getAddress(FALLBACK))
    expect(decoded[6]).toBe(0n) // payment
  })
})

describe('validateVaultConfig (FR-005)', () => {
  it('accepts a valid 2-of-3', () => {
    expect(() => validateVaultConfig([O1, O2, O3], 2)).not.toThrow()
  })
  it('rejects threshold greater than owner count', () => {
    expect(() => validateVaultConfig([O1, O2], 3)).toThrow(/exceed/)
  })
  it('rejects threshold below 1, duplicate owners, and invalid addresses', () => {
    expect(() => validateVaultConfig([O1, O2], 0)).toThrow(/at least 1/i)
    expect(() => validateVaultConfig([O1, O1], 1)).toThrow(/[Dd]uplicate/)
    expect(() => validateVaultConfig(['nope'], 1)).toThrow(/Invalid owner/)
  })
})

describe('computeVaultAddress', () => {
  const safe = getSafeContracts(63)
  const creationCode = '0x' + '60'.repeat(32) // stand-in proxy creation code (deterministic for the test)
  const initializer = buildSetupInitializer([O1, O2, O3], 2, FALLBACK)

  it('is deterministic and checksummed', () => {
    const a = computeVaultAddress({ proxyFactory: safe.proxyFactory, singleton: safe.singletonL2, initializer, saltNonce: 0, creationCode })
    const b = computeVaultAddress({ proxyFactory: safe.proxyFactory, singleton: safe.singletonL2, initializer, saltNonce: 0, creationCode })
    expect(a).toBe(b)
    expect(a).toBe(getAddress(a))
  })

  it('encodes the singleton as the same 32-byte word whether typed address or uint256 (factory parity)', () => {
    // The Safe factory appends uint256(uint160(singleton)); abi.encode(address) yields the identical word.
    const asAddress = computeVaultAddress({ proxyFactory: safe.proxyFactory, singleton: safe.singletonL2, initializer, saltNonce: 0, creationCode })
    const asUint = getCreate2Address(
      getAddress(safe.proxyFactory),
      solidityPackedKeccak256(['bytes32', 'uint256'], [keccak256(initializer), 0n]),
      keccak256(creationCode + coder.encode(['uint256'], [BigInt(safe.singletonL2)]).slice(2)),
    )
    expect(asAddress).toBe(asUint)
  })

  it('changes with saltNonce and with owners', () => {
    const base = computeVaultAddress({ proxyFactory: safe.proxyFactory, singleton: safe.singletonL2, initializer, saltNonce: 0, creationCode })
    const otherSalt = computeVaultAddress({ proxyFactory: safe.proxyFactory, singleton: safe.singletonL2, initializer, saltNonce: 1, creationCode })
    const otherOwners = computeVaultAddress({
      proxyFactory: safe.proxyFactory,
      singleton: safe.singletonL2,
      initializer: buildSetupInitializer([O1, O2], 2, FALLBACK),
      saltNonce: 0,
      creationCode,
    })
    expect(otherSalt).not.toBe(base)
    expect(otherOwners).not.toBe(base)
  })
})

describe('buildCreateVaultCalldata', () => {
  it('targets the proxy factory with createProxyWithNonce calldata', () => {
    const tx = buildCreateVaultCalldata({ chainId: 63, owners: [O1, O2, O3], threshold: 2, saltNonce: 5 })
    expect(getAddress(tx.to)).toBe(getAddress(getSafeContracts(63).proxyFactory))
    expect(tx.data.startsWith('0x1688f0b9')).toBe(true) // createProxyWithNonce selector
    expect(tx.initializer.startsWith('0xb63e800d')).toBe(true) // setup selector
  })

  it('rejects an invalid config before building', () => {
    expect(() => buildCreateVaultCalldata({ chainId: 63, owners: [O1, O2], threshold: 3, saltNonce: 0 })).toThrow(/exceed/)
  })

  it('is unchanged when policySetup is omitted vs undefined (spec 049 FR-010)', () => {
    const base = buildCreateVaultCalldata({ chainId: 63, owners: [O1, O2, O3], threshold: 2, saltNonce: 5 })
    const explicit = buildCreateVaultCalldata({ chainId: 63, owners: [O1, O2, O3], threshold: 2, saltNonce: 5, policySetup: undefined })
    expect(explicit.data).toBe(base.data)
    expect(explicit.initializer).toBe(base.initializer)
  })

  it('threads policySetup into the initializer (spec 049 US1)', () => {
    const tx = buildCreateVaultCalldata({
      chainId: 63,
      owners: [O1, O2, O3],
      threshold: 2,
      saltNonce: 5,
      policySetup: { setupTo: SETUP_TO, setupData: SETUP_DATA },
    })
    const decoded = new Interface(SAFE_SETUP_ABI).decodeFunctionData('setup', tx.initializer)
    expect(getAddress(decoded[2])).toBe(getAddress(SETUP_TO))
    expect(decoded[3]).toBe(SETUP_DATA)
    // A different initializer means a different CREATE2 address commitment than the plain vault.
    const plain = buildCreateVaultCalldata({ chainId: 63, owners: [O1, O2, O3], threshold: 2, saltNonce: 5 })
    expect(tx.initializer).not.toBe(plain.initializer)
  })
})

describe('loadVault', () => {
  it('returns isSafe:false when there is no contract at the address', async () => {
    const provider = { getCode: async () => '0x' }
    const res = await loadVault(O1, 63, provider)
    expect(res.isSafe).toBe(false)
    expect(res.reason).toBe('no-contract')
  })
})

describe('isVaultOwner', () => {
  it('is true only for an owner of a loaded Safe', () => {
    const vault = { isSafe: true, owners: [O1, O2] }
    expect(isVaultOwner(vault, O1)).toBe(true)
    expect(isVaultOwner(vault, O3)).toBe(false)
    expect(isVaultOwner({ isSafe: false }, O1)).toBe(false)
  })
})
