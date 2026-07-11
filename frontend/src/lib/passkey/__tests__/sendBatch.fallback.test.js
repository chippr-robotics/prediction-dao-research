import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendPasskeyBatch, isSponsorshipUnavailable } from '../sendBatch'
import { LIFECYCLE } from '../submission'

// Spec 050 — never-stranded fallback: a sponsored passkey UserOp that fails because sponsorship
// couldn't be applied is retried self-funded; a reverting op is NOT retried.

let network = { passkey: { bundlerUrls: ['https://bundler.test'], sponsorPaymasterUrl: 'https://relay.test/v1/paymaster' } }

vi.mock('../../../config/networks', () => ({ getNetwork: () => network }))

const ADDRESS = '0x000000000000000000000000000000000000a11c'
const knownCredentials = () => [
  { address: ADDRESS, credentialId: 'cred-1', publicKey: { x: `0x${'1'.repeat(64)}`, y: `0x${'2'.repeat(64)}` } },
]

const receiptOk = (tx) => ({
  sendUserOperation: null,
  getUserOperationReceipt: vi.fn().mockResolvedValue({ success: true, receipt: { transactionHash: tx } }),
})

function run({ buildAccount, onState = vi.fn() }) {
  return sendPasskeyBatch({
    chainId: 137,
    address: ADDRESS,
    calls: [{ target: ADDRESS, data: '0x', value: 0n }],
    onState,
    deps: {
      knownCredentials,
      probeRelayer: async () => ({ healthy: false }),
      probeBundler: async () => ({ healthy: true }),
      resolveOwnerIndex: async () => 0,
      buildAccount,
    },
  })
}

describe('sendPasskeyBatch never-stranded fallback (spec 050)', () => {
  beforeEach(() => {
    network = { passkey: { bundlerUrls: ['https://bundler.test'], sponsorPaymasterUrl: 'https://relay.test/v1/paymaster' } }
  })

  it('retries self-funded when sponsorship is unavailable (endpoint error)', async () => {
    const sponsoredClient = { ...receiptOk('0xtx'), sendUserOperation: vi.fn().mockRejectedValue(new Error('HTTP request failed')) }
    const selfClient = { ...receiptOk('0xtx'), sendUserOperation: vi.fn().mockResolvedValue('0xself') }
    const buildAccount = vi
      .fn()
      .mockResolvedValueOnce({ bundlerClient: sponsoredClient, sponsored: true })
      .mockResolvedValueOnce({ bundlerClient: selfClient, sponsored: false })

    const onState = vi.fn()
    const out = await run({ buildAccount, onState })

    expect(out.userOpHash).toBe('0xself')
    expect(out.sponsored).toBe(false)
    expect(out.txHash).toBe('0xtx')
    // second build forced self-funding
    expect(buildAccount).toHaveBeenCalledTimes(2)
    expect(buildAccount.mock.calls[1][0].deps.noPaymaster).toBe(true)
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ state: LIFECYCLE.DRAFT, sponsored: false }))
  })

  it('does NOT retry when the user operation reverts (surfaces the error)', async () => {
    const sponsoredClient = { ...receiptOk('0xtx'), sendUserOperation: vi.fn().mockRejectedValue(new Error('execution reverted: AA23')) }
    const buildAccount = vi.fn().mockResolvedValueOnce({ bundlerClient: sponsoredClient, sponsored: true })

    await expect(run({ buildAccount })).rejects.toThrow(/reverted/)
    expect(buildAccount).toHaveBeenCalledTimes(1) // no self-funded retry
  })

  it('does not fall back when the op was never sponsored (self-funded already)', async () => {
    const selfClient = { ...receiptOk('0xtx'), sendUserOperation: vi.fn().mockRejectedValue(new Error('HTTP request failed')) }
    const buildAccount = vi.fn().mockResolvedValueOnce({ bundlerClient: selfClient, sponsored: false })
    await expect(run({ buildAccount })).rejects.toThrow(/HTTP request failed/)
    expect(buildAccount).toHaveBeenCalledTimes(1)
  })

  it('classifies sponsorship-unavailable vs op-revert', () => {
    expect(isSponsorshipUnavailable(new Error('HTTP request failed'))).toBe(true)
    expect(isSponsorshipUnavailable(new Error('quota_exceeded'))).toBe(true)
    expect(isSponsorshipUnavailable(new Error('AA33 paymaster reverted'))).toBe(true)
    expect(isSponsorshipUnavailable(new Error('AA23 reverted: account validation'))).toBe(false)
    expect(isSponsorshipUnavailable(new Error('execution reverted'))).toBe(false)
    expect(isSponsorshipUnavailable(new Error('AA21 didn\'t pay prefund'))).toBe(false)
  })
})
