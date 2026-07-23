// Spec 063 (US2/US3) — CrossChainRecoveryPanel: unlock → scan → show discovered BTC/SOL → send SOL.
// The hook + unlock are mocked; this exercises the panel's own render/interaction logic.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const SOL_ADDR = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'

const { unlockLegacySecret } = vi.hoisted(() => ({ unlockLegacySecret: vi.fn() }))
vi.mock('../../lib/recovery/legacyKeys', () => ({ unlockLegacySecret }))

const hookState = {}
vi.mock('../../hooks/useCrossChainDiscovery', () => ({
  useCrossChainDiscovery: () => hookState,
}))

import CrossChainRecoveryPanel from '../../components/account/CrossChainRecoveryPanel'

const ENTRY = { address: '0xabc0000000000000000000000000000000000001', kind: 'mnemonic', protection: 'passphrase' }

beforeEach(() => {
  unlockLegacySecret.mockReset().mockResolvedValue('abandon abandon about')
  Object.assign(hookState, {
    status: 'idle',
    results: null,
    error: null,
    runDiscovery: vi.fn().mockResolvedValue({}),
    sendSol: vi.fn().mockResolvedValue({ signature: 'SIG123' }),
    reset: vi.fn(),
  })
})

describe('CrossChainRecoveryPanel', () => {
  it('unlocks with a passphrase then runs discovery', async () => {
    render(<CrossChainRecoveryPanel entry={ENTRY} />)
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /scan for funds/i }))
    await waitFor(() => expect(unlockLegacySecret).toHaveBeenCalled())
    expect(hookState.runDiscovery).toHaveBeenCalledWith({ kind: 'mnemonic', secret: 'abandon abandon about' })
  })

  it('shows discovered Bitcoin + Solana balances and a Send action', () => {
    hookState.status = 'done'
    hookState.results = {
      evm: { address: ENTRY.address },
      solana: [{ scheme: 'bip44Change', account: 0, address: SOL_ADDR, balanceLamports: 2_000_000_000n, status: 'found' }],
      bitcoin: { status: 'complete', holdings: [{ confirmedSats: 750000, spendableSats: 750000 }] },
    }
    render(<CrossChainRecoveryPanel entry={ENTRY} />)
    expect(screen.getByText(/0\.0075 BTC/)).toBeInTheDocument()
    expect(screen.getByText(/2 SOL/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument()
  })

  it('sends SOL through the hook with the entered recipient + amount', async () => {
    hookState.status = 'done'
    hookState.results = {
      evm: { address: ENTRY.address },
      solana: [{ scheme: 'bip44Change', account: 0, address: SOL_ADDR, balanceLamports: 2_000_000_000n, status: 'found' }],
      bitcoin: null,
    }
    render(<CrossChainRecoveryPanel entry={ENTRY} />)
    // Only the list "Send" exists initially; clicking it opens the send form.
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    fireEvent.change(screen.getByLabelText(/Recipient Solana address/i), { target: { value: SOL_ADDR } })
    fireEvent.change(screen.getByLabelText(/Amount in SOL/i), { target: { value: '1.5' } })
    // Now two "Send" buttons exist (list + form); the form's is the last.
    const sendButtons = screen.getAllByRole('button', { name: /^send$/i })
    fireEvent.click(sendButtons[sendButtons.length - 1])
    await waitFor(() => expect(hookState.sendSol).toHaveBeenCalledWith({ address: SOL_ADDR, to: SOL_ADDR, amountSol: '1.5' }))
  })

  it('discloses when no funds are found', () => {
    hookState.status = 'done'
    hookState.results = { evm: { address: ENTRY.address }, solana: [], bitcoin: { status: 'complete', holdings: [] } }
    render(<CrossChainRecoveryPanel entry={ENTRY} />)
    expect(screen.getAllByText(/No funds found/i).length).toBeGreaterThanOrEqual(2)
  })
})
