import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendPasskeyBatch } from '../sendBatch'
import { SubmissionUnavailable, LIFECYCLE } from '../submission'
import { CredentialRecordIncomplete } from '../smartAccount'

let network = { passkey: { bundlerUrls: ['https://bundler.test'] } }

vi.mock('../../../config/networks', () => ({
  getNetwork: () => network,
}))

const ADDRESS = '0x000000000000000000000000000000000000a11c'

function knownCredentials() {
  return [
    {
      address: ADDRESS,
      credentialId: 'cred-1',
      publicKey: { x: `0x${'1'.repeat(64)}`, y: `0x${'2'.repeat(64)}` },
    },
  ]
}

describe('sendPasskeyBatch', () => {
  beforeEach(() => {
    network = { passkey: { bundlerUrls: ['https://bundler.test'] } }
  })

  it('falls back to optimistic userop submission when health probes are unavailable', async () => {
    const bundlerClient = {
      sendUserOperation: vi.fn().mockResolvedValue('0xuserop'),
      getUserOperationReceipt: vi.fn().mockResolvedValue({
        success: true,
        receipt: { transactionHash: '0xtx' },
      }),
    }
    const onState = vi.fn()

    const out = await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      onState,
      deps: {
        knownCredentials,
        probeRelayer: async () => ({ healthy: false }),
        probeBundler: async () => ({ healthy: false }),
        buildAccount: vi.fn().mockResolvedValue({ bundlerClient }),
      },
    })

    expect(out.route).toBe('userop')
    expect(out.userOpHash).toBe('0xuserop')
    expect(out.txHash).toBe('0xtx')
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ state: LIFECYCLE.DRAFT, route: 'userop' }))
  })

  it('still throws SubmissionUnavailable when no bundler rail is configured', async () => {
    network = { passkey: { bundlerUrls: [] } }

    const err = await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      deps: {
        knownCredentials,
        probeRelayer: async () => ({ healthy: false }),
        probeBundler: async () => ({ healthy: false }),
      },
    }).catch((e) => e)

    expect(err).toBeInstanceOf(SubmissionUnavailable)
  })

  it('does not use optimistic fallback for intent-capable actions', async () => {
    const err = await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      intent: { intentCapable: true, submitIntent: vi.fn() },
      deps: {
        knownCredentials,
        probeRelayer: async () => ({ healthy: false }),
        probeBundler: async () => ({ healthy: false }),
      },
    }).catch((e) => e)

    expect(err).toBeInstanceOf(SubmissionUnavailable)
  })

  it('refuses an incomplete credential record with an actionable error (spec 045 FR-006)', async () => {
    // A record with an address but no key/id used to slip past the address
    // match and crash inside the signer with "reading 'id'".
    const err = await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      deps: { knownCredentials: () => [{ address: ADDRESS }] },
    }).catch((e) => e)
    expect(err).toBeInstanceOf(CredentialRecordIncomplete)
    expect(err.message).toMatch(/sign back in/i)
  })

  it('pins the session credential by id over the address match (spec 045 US3)', async () => {
    const buildAccount = vi.fn().mockResolvedValue({
      bundlerClient: {
        sendUserOperation: vi.fn().mockResolvedValue('0xuserop'),
        getUserOperationReceipt: vi.fn().mockResolvedValue({ success: true, receipt: { transactionHash: '0xtx' } }),
      },
    })
    const book = () => [
      { address: ADDRESS, credentialId: 'cred-first', publicKey: { x: `0x${'3'.repeat(64)}`, y: `0x${'4'.repeat(64)}` } },
      { address: ADDRESS, credentialId: 'cred-session', publicKey: { x: `0x${'1'.repeat(64)}`, y: `0x${'2'.repeat(64)}` } },
    ]
    await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      credentialId: 'cred-session',
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      deps: {
        knownCredentials: book,
        probeRelayer: async () => ({ healthy: true }),
        probeBundler: async () => ({ healthy: true }),
        resolveOwnerIndex: vi.fn().mockResolvedValue(0),
        buildAccount,
      },
    })
    expect(buildAccount.mock.calls[0][0].credential.credentialId).toBe('cred-session')
  })

  it('resolves and forwards the credential’s real owner index (spec 045 FR-009)', async () => {
    const buildAccount = vi.fn().mockResolvedValue({
      bundlerClient: {
        sendUserOperation: vi.fn().mockResolvedValue('0xuserop'),
        getUserOperationReceipt: vi.fn().mockResolvedValue({ success: true, receipt: { transactionHash: '0xtx' } }),
      },
    })
    const resolveOwnerIndex = vi.fn().mockResolvedValue(3)
    await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      deps: {
        knownCredentials,
        probeRelayer: async () => ({ healthy: true }),
        probeBundler: async () => ({ healthy: true }),
        resolveOwnerIndex,
        buildAccount,
      },
    })
    expect(resolveOwnerIndex).toHaveBeenCalledWith(expect.objectContaining({ accountAddress: ADDRESS }))
    expect(buildAccount.mock.calls[0][0].ownerIndex).toBe(3)
  })

  it('does not use optimistic fallback for account-native actions', async () => {
    const err = await sendPasskeyBatch({
      chainId: 137,
      address: ADDRESS,
      accountNative: true,
      calls: [{ target: ADDRESS, data: '0x', value: 0n }],
      deps: {
        knownCredentials,
        probeRelayer: async () => ({ healthy: false }),
        probeBundler: async () => ({ healthy: false }),
      },
    }).catch((e) => e)

    expect(err).toBeInstanceOf(SubmissionUnavailable)
  })
})
