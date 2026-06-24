import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

// Spec 028 expansion (T096) — axe accessibility checks (WCAG 2.1 AA) over the rebuilt Token Mint portal
// surfaces. Picked up by the gating CI step `npm test -- --run accessibility.test`. Covers the data tables,
// the activity filter radiogroup (the a11y fix from the Phase 14 review), explorer links, copy buttons, and the
// create form. Leaf panels are rendered with mocked data hooks so the markup is exercised deterministically.

vi.mock('../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../hooks/useClipboard', () => ({ default: () => ({ copied: false, error: null, copy: vi.fn().mockResolvedValue(true) }) }))

vi.mock('../components/tokens/tokenSubgraph', () => ({
  fetchHolders: vi.fn().mockResolvedValue({
    available: true,
    holders: [
      { account: '0x00000000000000000000000000000000000000a1', balance: '600000000000000000000', firstHeldAt: '1700000000' },
      { account: '0x00000000000000000000000000000000000000b2', balance: '400000000000000000000', firstHeldAt: '1700000000' },
    ],
  }),
  fetchActivity: vi.fn().mockResolvedValue({
    available: true,
    activity: [
      { id: '1', type: 'mint', actor: '0x00000000000000000000000000000000000000a1', to: '0x00000000000000000000000000000000000000a1', amount: '1000000000000000000', timestamp: '1700000000', txHash: '0xabc' },
      { id: '2', type: 'transfer', from: '0x00000000000000000000000000000000000000a1', to: '0x00000000000000000000000000000000000000b2', actor: '0x00000000000000000000000000000000000000a1', amount: '500000000000000000', timestamp: '1700000100', txHash: '0xdef' },
    ],
  }),
}))

vi.mock('../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' } }),
  listSupportedChainIds: () => [80002, 63, 137, 1337],
  NETWORKS: { 80002: { name: 'Polygon Amoy' }, 63: { name: 'Ethereum Classic Mordor' }, 137: { name: 'Polygon' }, 1337: { name: 'Hardhat' } },
}))
vi.mock('../config/contracts', () => ({
  getContractAddressForChain: (name, chainId) => (name === 'tokenFactory' && chainId === 63 ? '0x5bdf74Ce98D41bf35192c20B25ACd561C75CFe62' : undefined),
}))

// Keep the real ABI helpers + TOKEN_STANDARD; only stub the hook used by the create wizard.
vi.mock('../components/tokens/useTokenFactory', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTokenFactory: () => ({
      isSupported: true,
      canIssue: true,
      chainId: 63,
      status: 'idle',
      error: null,
      lastTxHash: null,
      createOpenERC20V2: vi.fn(),
      createOpenERC721V2: vi.fn(),
      createRestrictedERC20V2: vi.fn(),
    }),
  }
})

import ContractPanel from '../components/tokens/ContractPanel'
import HoldersPanel from '../components/tokens/HoldersPanel'
import ActivityPanel from '../components/tokens/ActivityPanel'
import CreateTokenWizard from '../components/tokens/CreateTokenWizard'

const token = {
  id: '1',
  tokenAddress: '0x00000000000000000000000000000000000000aa',
  standard: 0,
  name: 'Test Token',
  symbol: 'TKN',
  issuer: '0x00000000000000000000000000000000000000b1',
  createdAt: 1700000000,
  metadataURI: '',
}
const caps = { model: 'v2', standard: 0, decimals: 18, capped: false, cap: 0n }

describe('Token Mint portal accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ContractPanel has no axe violations', async () => {
    const { container } = render(<ContractPanel token={token} caps={caps} chainId={63} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('HoldersPanel (cap table) has no axe violations', async () => {
    const { container } = render(<HoldersPanel token={token} caps={caps} chainId={80002} />)
    await screen.findByText('60%')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('ActivityPanel (feed + radiogroup filter) has no axe violations', async () => {
    const { container } = render(<ActivityPanel token={token} caps={caps} chainId={80002} />)
    await screen.findByText('Mint')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('CreateTokenWizard (create form) has no axe violations', async () => {
    const { container } = render(<CreateTokenWizard onCreated={() => {}} onViewMine={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
