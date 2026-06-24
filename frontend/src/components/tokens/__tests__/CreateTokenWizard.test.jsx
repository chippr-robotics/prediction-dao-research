import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTokenWizard from '../CreateTokenWizard'

// Phase 11 (T084): the rebuilt role-based v2 create flow — standard cards, params, optional cap, deployment
// summary rail. Mock the data hook so form/validation/gating logic is tested in isolation.
const hook = vi.hoisted(() => ({
  state: {},
  showNotification: vi.fn(),
  createOpenERC20V2: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok' }),
  createOpenERC721V2: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok' }),
  createRestrictedERC20V2: vi.fn().mockResolvedValue({ id: '1', tokenAddress: '0xtok' }),
}))

vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: hook.showNotification }) }))

vi.mock('../useTokenFactory', () => ({
  useTokenFactory: () => ({
    isSupported: true, canIssue: true, status: 'idle', error: null, lastTxHash: null,
    createOpenERC20V2: hook.createOpenERC20V2,
    createOpenERC721V2: hook.createOpenERC721V2,
    createRestrictedERC20V2: hook.createRestrictedERC20V2,
    ...hook.state,
  }),
}))

describe('CreateTokenWizard (v2)', () => {
  beforeEach(() => { vi.clearAllMocks(); hook.state = {} })

  it('disables on an unsupported network (FR-023)', () => {
    hook.state = { isSupported: false }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/isn’t deployed on this network/i)).toBeInTheDocument()
  })

  it('warns + blocks submit when the wallet lacks the issuer role', () => {
    hook.state = { canIssue: false }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/isn’t authorized to issue tokens/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review & deploy/i })).toBeDisabled()
  })

  it('validates empty name (no tx)', async () => {
    const user = userEvent.setup()
    render(<CreateTokenWizard />)
    await user.click(screen.getByRole('button', { name: /review & deploy/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
    expect(hook.createOpenERC20V2).not.toHaveBeenCalled()
  })

  it('rejects initial supply over the cap', async () => {
    const user = userEvent.setup()
    render(<CreateTokenWizard />)
    await user.type(screen.getByLabelText(/^name$/i), 'Acme')
    await user.type(screen.getByLabelText(/^symbol$/i), 'ACME')
    await user.type(screen.getByLabelText(/initial supply/i), '200')
    await user.type(screen.getByLabelText(/max supply cap/i), '100')
    await user.click(screen.getByRole('button', { name: /review & deploy/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/exceeds the cap/i)
    expect(hook.createOpenERC20V2).not.toHaveBeenCalled()
  })

  it('submits a valid capped ERC-20 via createOpenERC20V2', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<CreateTokenWizard onCreated={onCreated} />)
    await user.type(screen.getByLabelText(/^name$/i), 'Acme')
    await user.type(screen.getByLabelText(/^symbol$/i), 'ACME')
    await user.type(screen.getByLabelText(/initial supply/i), '500')
    await user.type(screen.getByLabelText(/max supply cap/i), '1000')
    await user.click(screen.getByRole('button', { name: /review & deploy/i }))
    await waitFor(() => expect(hook.createOpenERC20V2).toHaveBeenCalledTimes(1))
    expect(hook.createOpenERC20V2.mock.calls[0][0]).toMatchObject({ name: 'Acme', symbol: 'ACME', initialSupply: '500', cap: '1000' })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    // fires the cohesive app-level notification on success
    await waitFor(() => expect(hook.showNotification).toHaveBeenCalledWith(expect.stringMatching(/created on-chain/i), 'success'))
  })

  it('selecting ERC-721 switches the create entrypoint + fields', async () => {
    const user = userEvent.setup()
    render(<CreateTokenWizard />)
    await user.click(screen.getByRole('button', { name: /non-fungible/i }))
    expect(screen.queryByLabelText(/initial supply/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/collection base uri/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^name$/i), 'Art')
    await user.type(screen.getByLabelText(/^symbol$/i), 'ART')
    await user.click(screen.getByRole('button', { name: /review & deploy/i }))
    await waitFor(() => expect(hook.createOpenERC721V2).toHaveBeenCalledTimes(1))
  })

  it('shows honest pending state', () => {
    hook.state = { status: 'creating', lastTxHash: '0xabcdef0000' }
    render(<CreateTokenWizard />)
    expect(screen.getByText(/awaiting confirmation/i)).toBeInTheDocument()
  })
})
