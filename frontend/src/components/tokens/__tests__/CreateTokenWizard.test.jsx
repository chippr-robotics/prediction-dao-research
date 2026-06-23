import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTokenWizard from '../CreateTokenWizard'

// Mock the data hook so the wizard's form/validation/gating logic is tested in isolation (spec 028 T025).
const hook = vi.hoisted(() => ({
  state: {},
  createOpenERC20: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok', txHash: '0xhash' }),
  createOpenERC721: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok' }),
  createRestrictedERC20: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok' }),
}))

vi.mock('../useTokenFactory', () => ({
  useTokenFactory: () => ({
    isSupported: true,
    canIssue: true,
    status: 'idle',
    error: null,
    lastTxHash: null,
    createOpenERC20: hook.createOpenERC20,
    createOpenERC721: hook.createOpenERC721,
    createRestrictedERC20: hook.createRestrictedERC20,
    ...hook.state,
  }),
}))

describe('CreateTokenWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.state = {}
  })

  it('disables the feature on an unsupported network (FR-023)', () => {
    hook.state = { isSupported: false }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/isn’t deployed on this network/i)).toBeInTheDocument()
  })

  it('warns and blocks submit when the wallet lacks the issuer role', () => {
    hook.state = { canIssue: false }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/isn’t authorized to issue tokens/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create token/i })).toBeDisabled()
  })

  it('validates empty name/symbol before submitting (no tx)', async () => {
    const user = userEvent.setup()
    render(<CreateTokenWizard />)
    await user.click(screen.getByRole('button', { name: /create token/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
    expect(hook.createOpenERC20).not.toHaveBeenCalled()
  })

  it('rejects out-of-range decimals', async () => {
    const user = userEvent.setup()
    render(<CreateTokenWizard />)
    await user.type(screen.getByLabelText(/^name$/i), 'Acme')
    await user.type(screen.getByLabelText(/^symbol$/i), 'ACME')
    const dec = screen.getByLabelText(/decimals/i)
    await user.clear(dec)
    await user.type(dec, '99')
    await user.click(screen.getByRole('button', { name: /create token/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/decimals must be/i)
    expect(hook.createOpenERC20).not.toHaveBeenCalled()
  })

  it('submits a valid ERC-20 with the chosen options and notifies onCreated', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<CreateTokenWizard onCreated={onCreated} />)

    await user.type(screen.getByLabelText(/^name$/i), 'Acme')
    await user.type(screen.getByLabelText(/^symbol$/i), 'ACME')
    await user.type(screen.getByLabelText(/initial supply/i), '1000')
    await user.click(screen.getByLabelText(/burnable/i))
    await user.click(screen.getByRole('button', { name: /create token/i }))

    await waitFor(() => expect(hook.createOpenERC20).toHaveBeenCalledTimes(1))
    const arg = hook.createOpenERC20.mock.calls[0][0]
    expect(arg).toMatchObject({ name: 'Acme', symbol: 'ACME', initialSupply: '1000', burnable: true, pausable: false })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('shows honest pending state and never finalizes early (FR-006/FR-024)', () => {
    hook.state = { status: 'creating', lastTxHash: '0xabcdef0000' }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/awaiting confirmation/i)).toBeInTheDocument()
    expect(screen.queryByText(/created and confirmed/i)).not.toBeInTheDocument()
  })
})
