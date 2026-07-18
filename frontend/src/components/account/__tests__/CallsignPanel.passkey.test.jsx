/**
 * Regression (spec 054 + spec 041): a passkey smart-account session has NO ethers
 * signer — every write must route through the wallet's unified `sendCalls` (a UserOp
 * self-call), exactly like the sibling account panels. The original CallsignPanel
 * gated its writes on `signer`, so a connected passkey wallet hit the dead
 * "Connect a wallet to continue." branch even though the account was fully connected
 * and Gold-tier. These tests pin the fix: reserve/commit and the register reveal both
 * fire `sendCalls` and never surface the connect-wallet error when only the signer
 * (not the wallet) is absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ethers } from 'ethers'
import { CALLSIGN_REGISTRY_ABI } from '../../../abis/callsignRegistry'

const REGISTRY = '0x00000000000000000000000000000000000c0de5'
const ACCOUNT = '0x1111111111111111111111111111111111111111'
const COMMITMENT = '0x' + 'ab'.repeat(32)

// Read transport used by readRegistry (isAvailable / makeCommitment / callsignOf).
// A passkey session's `provider` is a plain RPC read provider — reads work, there is
// simply no signer for writes.
const readContract = {
  isAvailable: vi.fn(async () => true),
  makeCommitment: vi.fn(async () => COMMITMENT),
  callsignOf: vi.fn(async () => ''),
  resolve: vi.fn(async () => ({})),
}

// Keep the real ethers surface (Interface, randomBytes, hexlify, isAddress) and only
// stub Contract so the panel's read calls resolve without a live chain.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      // Regular function so `new ethers.Contract(...)` works (arrows can't construct);
      // returning an object from a constructor yields that object.
      Contract: vi.fn(function () {
        return readContract
      }),
    },
  }
})

let walletState
vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))

let membershipState
vi.mock('../../../hooks/useRoleDetails', () => ({
  default: () => ({ getRoleDetails: () => membershipState }),
  MembershipTier: { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 },
}))

vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: () => REGISTRY,
}))

import CallsignPanel from '../CallsignPanel'

const iface = new ethers.Interface(CALLSIGN_REGISTRY_ABI)
const commitData = iface.encodeFunctionData('commit', [COMMITMENT])

function renderPanel() {
  return render(
    <MemoryRouter>
      <CallsignPanel />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  readContract.isAvailable.mockResolvedValue(true)
  readContract.makeCommitment.mockResolvedValue(COMMITMENT)
  readContract.callsignOf.mockResolvedValue('')
  // Passkey session: connected + Gold, `provider` is a read transport, NO signer.
  walletState = {
    address: ACCOUNT,
    provider: {},
    chainId: 137,
    isConnected: true,
    sendCalls: vi.fn(async () => ({ route: 'passkey', userOpHash: '0x1' })),
  }
  membershipState = { isActive: true, tier: 3 /* Gold */ }
})

describe('CallsignPanel — passkey (no-signer) write path', () => {
  it('reserves a callsign through sendCalls, not a signer transaction', async () => {
    renderPanel()

    // Wait out the initial callsign load before the chooser renders.
    fireEvent.change(await screen.findByLabelText(/choose a callsign/i), {
      target: { value: 'dontpanic' },
    })

    // Availability resolves → the Reserve button enables.
    const reserve = await screen.findByRole('button', { name: /reserve callsign/i })
    await waitFor(() => expect(reserve).toBeEnabled())

    fireEvent.click(reserve)

    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    const batch = walletState.sendCalls.mock.calls[0][0]
    expect(batch).toHaveLength(1)
    expect(batch[0].target).toBe(REGISTRY)
    expect(batch[0].data).toBe(commitData)

    // The commitment came from the read transport — a passkey session has no signer.
    expect(readContract.makeCommitment).toHaveBeenCalledWith('dontpanic', ACCOUNT, expect.any(String))
    // The dead "connect a wallet" branch must never appear for a connected passkey wallet.
    expect(screen.queryByText(/connect a wallet to continue/i)).toBeNull()
  })

  it('completes the reveal step through sendCalls', async () => {
    const salt = '0x' + '11'.repeat(32)
    // A pending commit already persisted (post-commit reload); its min-commit age has
    // elapsed, so the reveal button is live immediately.
    const key = `fairwins:callsign:pending:137:${ACCOUNT.toLowerCase()}`
    localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'register',
        callsign: 'dontpanic',
        salt,
        commitment: COMMITMENT,
        committedAt: Date.now() - 120_000, // well past the 60s min-commit age
      }),
    )
    renderPanel()

    const complete = await screen.findByRole('button', { name: /complete registration/i })
    fireEvent.click(complete)

    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    const batch = walletState.sendCalls.mock.calls[0][0]
    expect(batch[0].target).toBe(REGISTRY)
    expect(batch[0].data).toBe(iface.encodeFunctionData('register', ['dontpanic', salt]))
  })
})
