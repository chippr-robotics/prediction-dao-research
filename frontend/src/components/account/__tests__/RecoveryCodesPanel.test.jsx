import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Control the device-local code vault the panel is backed by (spec 037, US3).
const recoverCodes = vi.fn()
let vault = { canUse: true, hasBackup: true, busy: false, recoverCodes }
vi.mock('../../../hooks/useOpenChallengeCodeVault', () => ({
  useOpenChallengeCodeVault: () => vault,
  default: () => vault,
}))

import RecoveryCodesPanel from '../RecoveryCodesPanel'

describe('RecoveryCodesPanel (recovery codes in Security)', () => {
  beforeEach(() => {
    recoverCodes.mockReset()
    vault = { canUse: true, hasBackup: true, busy: false, recoverCodes }
  })

  it('always renders the Recovery codes heading', () => {
    render(<RecoveryCodesPanel />)
    expect(screen.getByRole('heading', { name: /recovery codes/i })).toBeInTheDocument()
  })

  it('prompts to connect a wallet when the vault is unavailable', () => {
    vault = { ...vault, canUse: false }
    render(<RecoveryCodesPanel />)
    expect(screen.getByText(/connect your wallet to recover/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /unlock/i })).toBeNull()
  })

  it('unlocks (one signature) and lists saved codes with a copy control (FR-023)', async () => {
    recoverCodes.mockResolvedValue([
      { code: 'river amber tiger kite', wagerId: 9, description: 'Rain in Denver', savedAt: 1735689600000 },
    ])
    render(<RecoveryCodesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /unlock my saved codes/i }))
    await waitFor(() => expect(screen.getByText('river amber tiger kite')).toBeInTheDocument())
    expect(recoverCodes).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Rain in Denver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy recovery code/i })).toBeInTheDocument()
  })

  it('shows an empty state when no codes are backed up on this device', async () => {
    recoverCodes.mockResolvedValue([])
    render(<RecoveryCodesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /unlock my saved codes/i }))
    await waitFor(() => expect(screen.getByText(/no saved codes on this device yet/i)).toBeInTheDocument())
  })

  it('surfaces an unlock error without crashing', async () => {
    recoverCodes.mockRejectedValue(new Error('User rejected signature'))
    render(<RecoveryCodesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /unlock my saved codes/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/user rejected signature/i))
  })
})
