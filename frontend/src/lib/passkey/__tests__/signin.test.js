/**
 * Spec 041 T043 — returning sign-in resolution (US3):
 *  - local mapping resolves fast (same browser);
 *  - cleared storage with a remembered public key re-derives the SAME address
 *    from the deterministic factory (the chain is the address book of last
 *    resort);
 *  - a credential with no local trace surfaces the honest relink error —
 *    never a guessed or freshly-derived different account;
 *  - the platform picker owns multi-credential choice (unpinned assertion).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../config/networks', () => ({
  getNetwork: vi.fn(() => ({
    chainId: 80002,
    rpcUrl: 'https://rpc.example',
    capabilities: { passkeyAccounts: true },
    passkey: { bundlerUrls: ['https://bundler.example'], erc20PaymasterUrl: null },
  })),
}))
vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: vi.fn((key) => ({
    accountFactory: '0xFAC7000000000000000000000000000000000001',
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  })[key]),
}))

import { resolveAddressForCredential } from '../../../connectors/passkey'
import { rememberCredential } from '../credentials'

const ACCOUNT = '0x00000000000000000000000000000000000a11ce'

beforeEach(() => localStorage.clear())

describe('resolveAddressForCredential', () => {
  it('resolves from the local mapping when present (fast path, ≤10 s SC-005 budget)', async () => {
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT })
    const out = await resolveAddressForCredential({ credentialId: 'cred-1', chainId: 80002 })
    expect(out).toBe(ACCOUNT)
  })

  it('re-derives the SAME address from the remembered public key after partial data loss', async () => {
    rememberCredential({
      credentialId: 'cred-1',
      publicKey: { x: '0x' + '1'.repeat(64), y: '0x' + '2'.repeat(64) },
      // no cached address — simulates a partially-migrated/cleared mapping
    })
    const publicClient = { readContract: vi.fn().mockResolvedValue(ACCOUNT) }
    const out = await resolveAddressForCredential({
      credentialId: 'cred-1',
      chainId: 80002,
      deps: { publicClient },
    })
    expect(out).toBe(ACCOUNT)
    // Derivation queried the deterministic factory with the credential's key.
    expect(publicClient.readContract.mock.calls[0][0].functionName).toBe('getAddress')
  })

  it('fails HONESTLY for an unknown credential — never invents an account', async () => {
    await expect(
      resolveAddressForCredential({ credentialId: 'cred-unknown', chainId: 80002 })
    ).rejects.toThrow(/not yet linked .* relink/i)
  })
})
