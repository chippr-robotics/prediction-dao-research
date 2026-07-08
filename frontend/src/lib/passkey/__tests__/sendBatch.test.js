import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendPasskeyBatch } from '../sendBatch'
import { SubmissionUnavailable, LIFECYCLE } from '../submission'

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
})
