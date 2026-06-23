import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TokenAdminPanel from '../TokenAdminPanel'
import { TOKEN_STANDARD } from '../../../abis/tokenFactory'

// Control the on-chain reads/writes via a configurable contract stub (spec 028 T029/T037).
const h = vi.hoisted(() => ({ stub: {} }))

vi.mock('ethers', () => ({
  ethers: {
    // Regular function so `new ethers.Contract(...)` constructs (arrow fns can't be `new`-ed).
    Contract: vi.fn(function Contract() {
      return h.stub
    }),
    parseUnits: (v) => BigInt(Math.floor(Number(v) || 0)),
    isAddress: () => true,
  },
}))

vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ account: '0xowner', signer: {}, provider: {} }),
}))

function erc20Stub(over = {}) {
  return {
    owner: vi.fn().mockResolvedValue('0xowner'),
    pausable: vi.fn().mockResolvedValue(true),
    burnable: vi.fn().mockResolvedValue(false),
    paused: vi.fn().mockResolvedValue(false),
    decimals: vi.fn().mockResolvedValue(18),
    ...over,
  }
}

const erc20Token = { tokenAddress: '0xtok', name: 'Acme', symbol: 'ACME', standard: TOKEN_STANDARD.OPEN_ERC20 }

describe('TokenAdminPanel — capability gating (FR-018)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the Pause control for a pausable ERC-20', async () => {
    h.stub = erc20Stub({ pausable: vi.fn().mockResolvedValue(true) })
    render(<TokenAdminPanel token={erc20Token} />)
    expect(await screen.findByRole('heading', { name: /^Pause$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Mint$/ })).toBeInTheDocument()
  })

  it('hides the Pause control for a non-pausable ERC-20', async () => {
    h.stub = erc20Stub({ pausable: vi.fn().mockResolvedValue(false) })
    render(<TokenAdminPanel token={erc20Token} />)
    // Mint always renders; wait for caps to load, then assert no Pause section.
    expect(await screen.findByRole('heading', { name: /^Mint$/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Pause$/ })).not.toBeInTheDocument()
  })

  it('warns and disables actions for a non-owner', async () => {
    h.stub = erc20Stub({ owner: vi.fn().mockResolvedValue('0xsomeoneelse') })
    render(<TokenAdminPanel token={erc20Token} />)
    expect(await screen.findByText(/aren’t the owner/i)).toBeInTheDocument()
    const mintBtn = screen.getByRole('button', { name: /^Mint$/ })
    expect(mintBtn).toBeDisabled()
  })

  it('renders ERC-1404 policy controls + an eligibility pre-check matching on-chain codes (SC-003/T037)', async () => {
    h.stub = {
      owner: vi.fn().mockResolvedValue('0xowner'),
      decimals: vi.fn().mockResolvedValue(18),
      detectTransferRestriction: vi.fn().mockResolvedValue(2),
      messageForTransferRestriction: vi.fn().mockResolvedValue('Recipient is not eligible to hold this token'),
    }
    const restrictedToken = { ...erc20Token, standard: TOKEN_STANDARD.RESTRICTED_ERC1404 }
    const user = userEvent.setup()
    render(<TokenAdminPanel token={restrictedToken} />)

    expect(await screen.findByRole('heading', { name: /^Eligibility$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Freeze$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /eligibility pre-check/i })).toBeInTheDocument()
    // ERC-20-only Pause control must NOT appear for a restricted token.
    expect(screen.queryByRole('heading', { name: /^Pause$/ })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^From$/), '0xaaa')
    await user.type(screen.getByLabelText(/^To$/), '0xbbb')
    await user.click(screen.getByRole('button', { name: /^Check$/ }))
    expect(await screen.findByText(/code 2/i)).toBeInTheDocument()
  })
})
