/**
 * Spec 041 T019 — smart-account layer: owner-bytes encodings (must match the
 * MultiOwnable ABI exactly — parity vectors from test/account/factory.test.js),
 * batch composition, guard refusals, capability gating per network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../config/networks', () => ({
  getNetwork: vi.fn((chainId) => {
    if (chainId === 80002) {
      return {
        chainId: 80002,
        rpcUrl: 'https://rpc.example',
        capabilities: { passkeyAccounts: true },
        passkey: { bundlerUrls: ['https://bundler.example'], sponsorPaymasterUrl: null },
      }
    }
    if (chainId === 137) {
      return {
        chainId: 137,
        rpcUrl: 'https://rpc.example',
        capabilities: { passkeyAccounts: true },
        passkey: {
          bundlerUrls: ['https://bundler.example/polygon'],
          sponsorPaymasterUrl: 'https://paymaster.example/polygon',
        },
      }
    }
    return { chainId, capabilities: { passkeyAccounts: false }, passkey: null }
  }),
}))

vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: vi.fn((key, chainId) => {
    if (chainId !== 80002 && chainId !== 137) return null
    return {
      accountFactory: '0xFAC70000000000000000000000000000000000001'.slice(0, 42),
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    }[key]
  }),
}))

vi.mock('viem/account-abstraction', async () => {
  const actual = await vi.importActual('viem/account-abstraction')
  return {
    ...actual,
    toWebAuthnAccount: vi.fn(() => ({ type: 'webAuthnAccount' })),
    // Echo the pinned `address` param (the factory-mismatch fix pins the sender) and expose an
    // isDeployed the getFactoryArgs override consults; default counterfactual.
    toCoinbaseSmartAccount: vi.fn(async (params) => ({
      address: params?.address ?? '0xACC0000000000000000000000000000000000001',
      isDeployed: vi.fn().mockResolvedValue(false),
    })),
    createBundlerClient: vi.fn((opts) => opts),
    createPaymasterClient: vi.fn((opts) => ({ __isPaymasterClient: true, ...opts })),
  }
})

import { createBundlerClient, createPaymasterClient, toCoinbaseSmartAccount } from 'viem/account-abstraction'
import {
  publicKeyToOwnerBytes,
  addressToOwnerBytes,
  buildAction,
  buildAccount,
  resolveOwnerIndex,
  encodeRemoveOwner,
  encodeAddWalletOwner,
  requirePasskeySupport,
  deriveAddress,
  defaultPublicClient,
  ChainNotSupportedError,
  LastControllerError,
  CredentialRecordIncomplete,
  CredentialNotControllerError,
} from '../smartAccount'

const X = '0x' + '11'.repeat(32)
const Y = '0x' + '22'.repeat(32)

describe('owner-bytes encodings (MultiOwnable ABI parity)', () => {
  it('encodes a P-256 public key as 64 bytes x||y (abi.encode(bytes32,bytes32))', () => {
    const bytes = publicKeyToOwnerBytes({ x: X, y: Y })
    expect(bytes).toBe('0x' + '11'.repeat(32) + '22'.repeat(32))
    expect(bytes.length).toBe(2 + 128)
  })

  it('encodes an EOA as 32 bytes left-padded (abi.encode(address))', () => {
    const addr = '0xAbCd000000000000000000000000000000000123'
    const bytes = addressToOwnerBytes(addr)
    expect(bytes).toBe('0x' + '0'.repeat(24) + addr.slice(2).toLowerCase())
    expect(bytes.length).toBe(2 + 64)
  })
})

describe('capability gating (FR-022)', () => {
  it('resolves the stack on a supported network', () => {
    const out = requirePasskeySupport(80002)
    expect(out.factory).toMatch(/^0xFAC7/i)
    expect(out.bundlerUrls).toHaveLength(1)
  })

  it('throws ChainNotSupportedError on ETC/Mordor-class networks', () => {
    expect(() => requirePasskeySupport(63)).toThrow(ChainNotSupportedError)
  })
})

describe('defaultPublicClient (issue #854 — client.chain.id crash)', () => {
  it('sets a chain with the network id, not just a bare transport', () => {
    // viem's toCoinbaseSmartAccount reads `client.chain.id` unconditionally inside
    // sign/signMessage/signTypedData/signUserOperation. A publicClient built without
    // a `chain` leaves that undefined, so every passkey ceremony crashed with
    // "Cannot read properties of undefined (reading 'id')" the moment it tried to sign.
    const client = defaultPublicClient(80002)
    expect(client.chain).toBeDefined()
    expect(client.chain.id).toBe(80002)
  })

  it('is reused as-is by buildAccount/deriveAddress/readControllers (no separate bare client)', () => {
    const client = defaultPublicClient(137)
    expect(client.chain.id).toBe(137)
  })
})

describe('deriveAddress', () => {
  it('reads the factory getAddress with the exact (owners, nonce) inputs', async () => {
    const publicClient = { readContract: vi.fn().mockResolvedValue('0xACC0000000000000000000000000000000000001') }
    const ownersBytes = [publicKeyToOwnerBytes({ x: X, y: Y })]
    const addr = await deriveAddress({ chainId: 80002, ownersBytes, nonce: 7n, deps: { publicClient } })
    expect(addr).toMatch(/^0xACC/)
    const call = publicClient.readContract.mock.calls[0][0]
    expect(call.functionName).toBe('getAddress')
    expect(call.args).toEqual([ownersBytes, 7n])
    expect(call.address).toMatch(/^0xFAC7/i)
  })
})

describe('action composition + guards', () => {
  it('buildAction shapes approve+act as one batch (FR-016)', () => {
    const { calls } = buildAction([
      { target: '0x' + 'a'.repeat(40), data: '0x01' },
      { target: '0x' + 'b'.repeat(40), data: '0x02', value: 5n },
    ])
    expect(calls).toEqual([
      { to: '0x' + 'a'.repeat(40), value: 0n, data: '0x01' },
      { to: '0x' + 'b'.repeat(40), value: 5n, data: '0x02' },
    ])
  })

  it('encodeRemoveOwner refuses to strand the account (FR-020 client half)', () => {
    expect(() => encodeRemoveOwner({ index: 0n, ownerBytes: '0x' + '0'.repeat(64), ownerCount: 1n })).toThrow(
      LastControllerError
    )
  })

  it('encodeRemoveOwner / encodeAddWalletOwner produce calldata for the vendored ABI', () => {
    const remove = encodeRemoveOwner({
      index: 1n,
      ownerBytes: addressToOwnerBytes('0x' + 'c'.repeat(40)),
      ownerCount: 2n,
    })
    expect(remove.startsWith('0x')).toBe(true)
    const add = encodeAddWalletOwner('0x' + 'd'.repeat(40))
    expect(add.startsWith('0x')).toBe(true)
    expect(add.toLowerCase()).toContain('d'.repeat(40))
  })
})

describe('buildAccount credential validation (spec 045 FR-006)', () => {
  it('refuses an incomplete record before any ceremony — the old "reading id" crash', async () => {
    const publicClient = { readContract: vi.fn(), getCode: vi.fn() }
    await expect(
      buildAccount({ chainId: 80002, credential: { address: '0xA11CE' }, deps: { publicClient } })
    ).rejects.toBeInstanceOf(CredentialRecordIncomplete)
    await expect(
      buildAccount({ chainId: 80002, credential: { credentialId: 'c1' }, deps: { publicClient } })
    ).rejects.toBeInstanceOf(CredentialRecordIncomplete)
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })
})

describe('buildAccount sponsoring-paymaster wiring (spec 050)', () => {
  const credential = { credentialId: 'c1', publicKey: { x: X, y: Y } }
  const publicClient = { readContract: vi.fn(), getCode: vi.fn() }

  beforeEach(() => {
    createBundlerClient.mockClear()
    createPaymasterClient.mockClear()
  })

  it('builds a paymaster client from the network config, passes it to the bundler client, and reports sponsored:true', async () => {
    const out = await buildAccount({ chainId: 137, credential, ownerIndex: 0, deps: { publicClient } })

    expect(createPaymasterClient).toHaveBeenCalledTimes(1)
    const bundlerOpts = createBundlerClient.mock.calls[0][0]
    expect(bundlerOpts.paymaster).toEqual(expect.objectContaining({ __isPaymasterClient: true }))
    expect(out.sponsored).toBe(true)
  })

  it('omits the paymaster (native-token fallback, sponsored:false) when no sponsor endpoint is configured', async () => {
    const out = await buildAccount({ chainId: 80002, credential, ownerIndex: 0, deps: { publicClient } })

    expect(createPaymasterClient).not.toHaveBeenCalled()
    const bundlerOpts = createBundlerClient.mock.calls[0][0]
    expect(bundlerOpts.paymaster).toBeUndefined()
    expect(out.sponsored).toBe(false)
  })

  it('deps.noPaymaster forces self-funding even when a sponsor endpoint is configured (never-stranded retry)', async () => {
    const out = await buildAccount({ chainId: 137, credential, ownerIndex: 0, deps: { publicClient, noPaymaster: true } })

    expect(createPaymasterClient).not.toHaveBeenCalled()
    const bundlerOpts = createBundlerClient.mock.calls[0][0]
    expect(bundlerOpts.paymaster).toBeUndefined()
    expect(out.sponsored).toBe(false)
  })

  it('a test-injected deps.paymaster still overrides the configured URL', async () => {
    const injected = { __testPaymaster: true }
    const out = await buildAccount({ chainId: 137, credential, ownerIndex: 0, deps: { publicClient, paymaster: injected } })

    expect(createPaymasterClient).not.toHaveBeenCalled()
    const bundlerOpts = createBundlerClient.mock.calls[0][0]
    expect(bundlerOpts.paymaster).toBe(injected)
    expect(out.sponsored).toBe(true)
  })
})

describe('buildAccount FairWins-factory address pinning (factory-mismatch fix)', () => {
  const credential = { credentialId: 'c1', publicKey: { x: X, y: Y } }
  const ownerBytes = publicKeyToOwnerBytes({ x: X, y: Y })
  const FUNDED = '0xF1F269F7ABF9C94963692D53A0D9386DB36EA4C0'

  beforeEach(() => {
    toCoinbaseSmartAccount.mockClear()
  })

  it('pins the viem sender to the caller-supplied account address (never viem’s Coinbase-factory address)', async () => {
    const publicClient = { readContract: vi.fn(), getCode: vi.fn() }
    const out = await buildAccount({
      chainId: 137,
      credential,
      accountAddress: FUNDED,
      ownerIndex: 0,
      deps: { publicClient },
    })
    // viem is told the address explicitly — it must NOT query its own (wrong) factory to derive it.
    expect(toCoinbaseSmartAccount.mock.calls[0][0].address).toBe(FUNDED)
    expect(publicClient.readContract).not.toHaveBeenCalled()
    expect(out.account.address).toBe(FUNDED)
  })

  it('derives the sender from the FairWins factory (getAddress) when the caller omits it', async () => {
    const publicClient = { readContract: vi.fn().mockResolvedValue(FUNDED), getCode: vi.fn() }
    await buildAccount({ chainId: 137, credential, ownerIndex: 0, deps: { publicClient } })
    // deriveAddress → getAddress on the FairWins-deployed factory (0xFAC7…), with the credential’s owner bytes.
    const call = publicClient.readContract.mock.calls[0][0]
    expect(call.functionName).toBe('getAddress')
    expect(call.address).toMatch(/^0xFAC7/i)
    expect(call.args).toEqual([[ownerBytes], 0n])
    // …and that derived address is what viem is pinned to.
    expect(toCoinbaseSmartAccount.mock.calls[0][0].address).toBe(FUNDED)
  })

  it('overrides getFactoryArgs to deploy via the FairWins factory while counterfactual', async () => {
    const publicClient = { readContract: vi.fn(), getCode: vi.fn() }
    const out = await buildAccount({
      chainId: 137,
      credential,
      accountAddress: FUNDED,
      ownerIndex: 0,
      deps: { publicClient },
    })
    const args = await out.account.getFactoryArgs()
    // The FairWins factory (0xFAC7…), NOT viem’s hardwired Coinbase factory (0x0ba5ed0c…).
    expect(args.factory).toMatch(/^0xFAC7/i)
    expect(args.factory.toLowerCase()).not.toBe('0x0ba5ed0c6aa8c49038f819e587e2633c4a9f428a')
    // createAccount([ownerBytes], 0) calldata carries the initial owner bytes.
    expect(args.factoryData.toLowerCase()).toContain('11'.repeat(32) + '22'.repeat(32))
  })

  it('emits NO initCode once the account is deployed (preserves viem’s isDeployed guard)', async () => {
    const publicClient = { readContract: vi.fn(), getCode: vi.fn() }
    const out = await buildAccount({
      chainId: 137,
      credential,
      accountAddress: FUNDED,
      ownerIndex: 0,
      deps: { publicClient },
    })
    out.account.isDeployed.mockResolvedValue(true)
    const args = await out.account.getFactoryArgs()
    expect(args).toEqual({ factory: undefined, factoryData: undefined })
  })
})

describe('resolveOwnerIndex (spec 045 FR-009)', () => {
  const credential = { credentialId: 'c1', publicKey: { x: X, y: Y } }
  const myOwnerBytes = publicKeyToOwnerBytes({ x: X, y: Y })

  it('returns the credential’s REAL slot on a deployed multi-controller account', async () => {
    const readControllers = vi.fn().mockResolvedValue({
      deployed: true,
      controllers: [
        { index: 0n, kind: 'wallet', ownerBytes: addressToOwnerBytes('0x' + 'e'.repeat(40)) },
        { index: 2n, kind: 'passkey', ownerBytes: myOwnerBytes },
      ],
    })
    const out = await resolveOwnerIndex({
      chainId: 80002,
      accountAddress: '0xACC',
      credential,
      deps: { readControllers },
    })
    expect(out).toBe(2)
  })

  it('falls back to slot 0 for counterfactual (undeployed) accounts', async () => {
    const readControllers = vi.fn().mockResolvedValue({ deployed: false, controllers: [] })
    expect(
      await resolveOwnerIndex({ chainId: 80002, accountAddress: '0xACC', credential, deps: { readControllers } })
    ).toBe(0)
  })

  it('falls back to slot 0 when controllers cannot be read (RPC failure)', async () => {
    const readControllers = vi.fn().mockRejectedValue(new Error('rpc down'))
    expect(
      await resolveOwnerIndex({ chainId: 80002, accountAddress: '0xACC', credential, deps: { readControllers } })
    ).toBe(0)
  })

  it('throws (never guesses) when the deployed account no longer lists the credential', async () => {
    const readControllers = vi.fn().mockResolvedValue({
      deployed: true,
      controllers: [{ index: 0n, kind: 'wallet', ownerBytes: addressToOwnerBytes('0x' + 'e'.repeat(40)) }],
    })
    await expect(
      resolveOwnerIndex({ chainId: 80002, accountAddress: '0xACC', credential, deps: { readControllers } })
    ).rejects.toBeInstanceOf(CredentialNotControllerError)
  })
})
