import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TokenDetailView from '../TokenDetailView'

// Phase 11 (T083): the per-token detail view detects the token's model + the caller's authority and renders ONLY
// valid sub-tabs/controls (FR-028/SC-014). Mock the data hook so gating is tested in isolation; sub-panel
// contract reads degrade gracefully under the global ethers mock.
const STD = { OPEN_ERC20: 0, OPEN_ERC721: 1, RESTRICTED_ERC1404: 2, PERMISSIONED_ERC3643: 3 }
const h = vi.hoisted(() => ({ caps: {}, live: { owner: '0xowner', supplyDisplay: '500.0 REG', paused: false } }))

vi.mock('../useTokenFactory', () => ({
  useTokenFactory: () => ({
    detectCapabilities: vi.fn().mockResolvedValue(h.caps),
    readTokenLive: vi.fn().mockResolvedValue(h.live),
    reader: {},
    signer: {},
  }),
  tokenRuleSummary: () => 'Governing rule summary.',
  v2AbiForStandard: () => [],
  v1AbiForStandard: () => [],
  // inline literal — vi.mock is hoisted above the `STD` const, so it can't reference it.
  TOKEN_STANDARD: { OPEN_ERC20: 0, OPEN_ERC721: 1, RESTRICTED_ERC1404: 2, PERMISSIONED_ERC3643: 3 },
}))

vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ account: '0xowner', signer: {} }),
}))

const restrictedToken = { id: '1', standard: STD.RESTRICTED_ERC1404, tokenAddress: '0x00000000000000000000000000000000000000a1', issuer: '0x00000000000000000000000000000000000000bb', name: 'Meridian', symbol: 'MRDN' }

function adminV2Caps(over = {}) {
  return { model: 'v2', standard: STD.RESTRICTED_ERC1404, isAdmin: true, roles: { admin: true, minter: true, pauser: true, burner: true, compliance: true }, capped: true, cap: 1000000000000000000000n, paused: false, decimals: 18, ...over }
}

describe('TokenDetailView — capability gating (FR-028/SC-014)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('v2 restricted admin: header, model badge, and all valid sub-tabs render', async () => {
    h.caps = adminV2Caps()
    render(<TokenDetailView token={restrictedToken} onBack={() => {}} />)
    expect(await screen.findByRole('heading', { name: 'Meridian' })).toBeInTheDocument()
    // label appears in both the header badge and the overview contract-details card
    expect(screen.getAllByText('Restricted (ERC-1404)').length).toBeGreaterThan(0)
    expect(screen.getByText('Role-based')).toBeInTheDocument()
    // sub-tabs valid for a fungible restricted v2 token
    for (const t of ['Overview', 'Supply', 'Transfer controls', 'Compliance', 'Roles & ownership', 'Contract']) {
      expect(screen.getByRole('tab', { name: t })).toBeInTheDocument()
    }
    expect(await screen.findByText('500.0 REG')).toBeInTheDocument()
  })

  it('ERC-721 v2: no Supply tab (non-fungible)', async () => {
    h.caps = adminV2Caps({ standard: STD.OPEN_ERC721, capped: false, cap: 0n })
    const nft = { ...restrictedToken, standard: STD.OPEN_ERC721, name: 'Atlas', symbol: 'ATL' }
    render(<TokenDetailView token={nft} onBack={() => {}} />)
    await screen.findByRole('heading', { name: 'Atlas' })
    expect(screen.queryByRole('tab', { name: 'Supply' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Compliance' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer controls' })).toBeInTheDocument()
  })

  it('non-admin viewer: read-only notice shown', async () => {
    h.caps = adminV2Caps({ isAdmin: false, roles: { admin: false, minter: false, pauser: false, burner: false, compliance: false } })
    render(<TokenDetailView token={restrictedToken} onBack={() => {}} />)
    expect(await screen.findByText(/viewing this token read-only/i)).toBeInTheDocument()
  })

  it('v1 Ownable token: model is owner-managed and Roles tab explains no scoped roles', async () => {
    h.caps = { model: 'v1', standard: STD.OPEN_ERC20, isAdmin: true, roles: {}, capped: false, cap: null, paused: false, decimals: 18, owner: '0xowner', burnable: true, pausable: true }
    const t = { ...restrictedToken, standard: STD.OPEN_ERC20, name: 'Legacy', symbol: 'LEG' }
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<TokenDetailView token={t} onBack={() => {}} />)
    expect(await screen.findByText('Owner-managed')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Roles & ownership' }))
    await waitFor(() => expect(screen.getByText(/no scoped roles/i)).toBeInTheDocument())
  })
})
