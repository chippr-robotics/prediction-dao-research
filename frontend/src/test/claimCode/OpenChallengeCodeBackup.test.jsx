import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the flow hooks so the modal renders without chain/IPFS; the vault uses real crypto + localStorage.
const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})
vi.mock('../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ discover: vi.fn(), accept: vi.fn(), busy: false, error: null }),
}))

import OpenChallengeModal from '../../components/fairwins/OpenChallengeModal'
import { WalletContext } from '../../contexts/WalletContext'

const ACCOUNT = '0x9999999999999999999999999999999999999999'

function withWallet(ui) {
  const value = {
    account: ACCOUNT,
    address: ACCOUNT,
    chainId: 137,
    isConnected: true,
    // Deterministic signature → deterministic vault key, so save/recover round-trips.
    signer: { signMessage: vi.fn().mockResolvedValue('0xdeadbeefsignature') },
  }
  return render(<WalletContext.Provider value={value}>{ui}</WalletContext.Provider>)
}

describe('OpenChallengeModal — encrypted code backup & recovery (feature 024)', () => {
  beforeEach(() => { createOpenChallenge.mockReset(); localStorage.clear() })

  it('saves an encrypted backup after creating, then recovers it on the Recover tab', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 12n, txHash: '0xabc' })
    withWallet(<OpenChallengeModal isOpen onClose={() => {}} />)

    // Create the challenge.
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))
    await screen.findByText('river tiger kite zoo')

    // Save the encrypted backup.
    fireEvent.click(screen.getByRole('button', { name: /save encrypted backup/i }))
    expect(await screen.findByText(/encrypted backup saved/i)).toBeInTheDocument()

    // Nothing recoverable is stored in cleartext.
    const raw = localStorage.getItem(`fairwins.occodevault.${ACCOUNT.toLowerCase()}`)
      || localStorage.getItem(`fairwins.ocCodeVault.${ACCOUNT.toLowerCase()}`)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('river tiger kite zoo')

    // Recover it from the Recover codes tab.
    fireEvent.click(screen.getByRole('tab', { name: /recover codes/i }))
    fireEvent.click(screen.getByRole('button', { name: /unlock my saved codes/i }))
    await waitFor(() => expect(screen.getByText('river tiger kite zoo')).toBeInTheDocument())
    expect(screen.getByText(/Will it rain\?/)).toBeInTheDocument()
    expect(screen.getByText(/#12/)).toBeInTheDocument()
  })

  it('Recover tab shows an empty state when nothing is backed up', async () => {
    withWallet(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /recover codes/i }))
    fireEvent.click(screen.getByRole('button', { name: /unlock my saved codes/i }))
    expect(await screen.findByText(/no saved codes on this device/i)).toBeInTheDocument()
  })
})
