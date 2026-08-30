// Spec 043 (US3) — the active-account seam. Personal mode sends; the SafeTx builder wraps a batch in
// MultiSendCallOnly (delegatecall) and a single call directly. (The full vault emit+approve path is exercised
// via the app; here we cover the routing decision and payload construction, which are the risk points.)

import { describe, it, expect, vi } from 'vitest'
import { getAddress } from 'ethers'
import { buildActiveAccountSafeTx, submitAsActiveAccount } from '../../lib/custody/submitAsActiveAccount'
import { DELEGATECALL, CALL } from '../../lib/custody/vaultTransaction'

const MS = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2'
const TO = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'

describe('buildActiveAccountSafeTx', () => {
  it('uses a single call directly (operation CALL)', () => {
    const tx = buildActiveAccountSafeTx({ to: TO, value: 5n, data: '0x' }, { nonce: 3n, multiSendCallOnly: MS })
    expect(getAddress(tx.to)).toBe(getAddress(TO))
    expect(tx.value).toBe(5n)
    expect(tx.operation).toBe(CALL)
    expect(tx.nonce).toBe(3n)
  })

  it('wraps a batch in MultiSendCallOnly (operation DELEGATECALL to the MS contract)', () => {
    const batch = [
      { to: TOKEN, data: '0xabcd' },
      { to: TO, value: 1n },
    ]
    const tx = buildActiveAccountSafeTx({ batch }, { nonce: 9n, multiSendCallOnly: MS })
    expect(getAddress(tx.to)).toBe(getAddress(MS))
    expect(tx.operation).toBe(DELEGATECALL)
    expect(tx.data.startsWith('0x8d80ff0a')).toBe(true) // multiSend(bytes)
    expect(tx.nonce).toBe(9n)
  })

  // Issue #1368 — when a batch has to be split into N proposals for a policy-guarded vault, they
  // MUST occupy consecutive nonces. Proposed at the same nonce they would be mutually exclusive
  // (executing one invalidates the rest), so only one payment could ever land.
  it('honours an explicit nonce so a split batch can be queued in order', () => {
    const tx = buildActiveAccountSafeTx({ to: TO, value: 1n, nonce: 12n }, { nonce: 4n, multiSendCallOnly: MS })
    expect(tx.nonce).toBe(12n)
    expect(tx.operation).toBe(CALL)
  })

  it('a single-leg batch is a plain CALL, not a one-entry MultiSend delegatecall', () => {
    const tx = buildActiveAccountSafeTx({ batch: [{ to: TOKEN, data: '0xabcd' }] }, { nonce: 1n, multiSendCallOnly: MS })
    expect(getAddress(tx.to)).toBe(getAddress(TOKEN))
    expect(tx.operation).toBe(CALL)
    expect(tx.data).toBe('0xabcd')
  })
})

describe('submitAsActiveAccount (personal mode)', () => {
  it('sends via the connected signer and returns a sent result', async () => {
    const signer = { sendTransaction: vi.fn().mockResolvedValue({ hash: '0xdeadbeef' }) }
    const res = await submitAsActiveAccount({ to: TO, value: 7n, data: '0x' }, { mode: 'personal', signer })
    expect(res).toEqual({ kind: 'sent', txHash: '0xdeadbeef' })
    expect(signer.sendTransaction).toHaveBeenCalledWith({ to: TO, value: 7n, data: '0x' })
  })
})

describe('submitAsActiveAccount (vault mode) guards', () => {
  it('throws a clear error when the hub is not configured', async () => {
    await expect(
      submitAsActiveAccount({ to: TO }, { mode: 'vault', vaultAddress: TO, chainId: 63, hubAddress: undefined, safeContracts: {}, signer: {} }),
    ).rejects.toThrow(/not configured/i)
  })

  it('throws when Safe contracts are unavailable on the network', async () => {
    await expect(
      submitAsActiveAccount({ to: TO }, { mode: 'vault', vaultAddress: TO, chainId: 63, hubAddress: TO, safeContracts: undefined, signer: {} }),
    ).rejects.toThrow(/not available/i)
  })

  it('refuses when the connected provider is on a different chain than the vault', async () => {
    const provider = { getNetwork: async () => ({ chainId: 137n }) }
    await expect(
      submitAsActiveAccount(
        { to: TO },
        { mode: 'vault', vaultAddress: TO, chainId: 63, hubAddress: TO, safeContracts: { multiSendCallOnly: TO }, signer: {}, provider },
      ),
    ).rejects.toThrow(/not connected to the vault/i)
  })
})
