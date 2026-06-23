import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TokenDetail from '../TokenDetail'
import TokenList from '../TokenList'
import { TOKEN_STANDARD } from '../../../abis/tokenFactory'

// Spec 028 US5 (T048): public profile + discovery. Mock the data hook so the view/list logic is tested in
// isolation against real-shaped records (no mock-list fallback).
const h = vi.hoisted(() => ({ hook: {} }))

vi.mock('../useTokenFactory', () => ({
  useTokenFactory: () => h.hook,
  tokenRuleSummary: (r) =>
    r.standard === TOKEN_STANDARD.RESTRICTED_ERC1404
      ? 'Identity-restricted (ERC-1404): only eligible, unfrozen, unsanctioned addresses may hold or transfer.'
      : 'Open token — anyone may hold or transfer (subject to sanctions screening).',
}))

const erc20 = {
  id: '1',
  standard: TOKEN_STANDARD.OPEN_ERC20,
  tokenAddress: '0x00000000000000000000000000000000000000a1',
  issuer: '0x00000000000000000000000000000000000000bb',
  name: 'Acme',
  symbol: 'ACME',
  metadataURI: 'ipfs://meta',
  isBurnable: true,
  isPausable: false,
}

const restricted = { ...erc20, standard: TOKEN_STANDARD.RESTRICTED_ERC1404, tokenAddress: '0x00000000000000000000000000000000000000a2', name: 'Reg', symbol: 'REG' }

describe('TokenDetail (US5 public profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.hook = {}
  })

  it('renders standard, metadata, live supply, owner, and rule summary from real data', async () => {
    h.hook = {
      isSupported: true,
      readTokenLive: vi.fn().mockResolvedValue({ owner: '0x00000000000000000000000000000000000000cc', supplyDisplay: '1000.0 ACME', paused: false }),
    }
    render(<TokenDetail token={erc20} />)

    expect(screen.getByText('Open ERC-20')).toBeInTheDocument()
    expect(screen.getByText(erc20.tokenAddress)).toBeInTheDocument()
    expect(screen.getByText('ipfs://meta')).toBeInTheDocument()
    expect(await screen.findByText('1000.0 ACME')).toBeInTheDocument()
    expect(screen.getByText('0x00000000000000000000000000000000000000cc')).toBeInTheDocument()
    expect(screen.getByText(/anyone may hold or transfer/i)).toBeInTheDocument()
  })

  it('shows the restricted-token governing rule truthfully', async () => {
    h.hook = { isSupported: true, readTokenLive: vi.fn().mockResolvedValue({ owner: '0xowner', supplyDisplay: '5.0 REG', paused: false }) }
    render(<TokenDetail token={restricted} />)
    expect(screen.getByText('Restricted (ERC-1404)')).toBeInTheDocument()
    expect(screen.getByText(/identity-restricted/i)).toBeInTheDocument()
  })
})

describe('TokenList — public browse (US5 discovery)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.hook = {}
  })

  it('disables on an unsupported network with no mock list (FR-023)', () => {
    h.hook = { isSupported: false }
    render(<TokenList mode="all" />)
    expect(screen.getByText(/isn’t deployed on this network/i)).toBeInTheDocument()
  })

  it('lists only the network-scoped registry records with live supply (no mock entries)', async () => {
    const listAllTokens = vi.fn().mockResolvedValue({ records: [erc20], total: 1, truncated: false })
    h.hook = {
      isSupported: true,
      isConnected: true,
      listAllTokens,
      readTokenLive: vi.fn().mockResolvedValue({ supplyDisplay: '1000.0 ACME' }),
    }
    render(<TokenList mode="all" selectLabel="View" />)

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Open ERC-20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^View$/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1000.0 ACME')).toBeInTheDocument())
    expect(listAllTokens).toHaveBeenCalled()
    // Exactly one row — the registry record, no mock/phantom entries.
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('notes truncation honestly when more tokens exist than shown', async () => {
    h.hook = {
      isSupported: true,
      isConnected: true,
      listAllTokens: vi.fn().mockResolvedValue({ records: [erc20], total: 250, truncated: true }),
      readTokenLive: vi.fn().mockResolvedValue({ supplyDisplay: '1000.0 ACME' }),
    }
    render(<TokenList mode="all" />)
    expect(await screen.findByText(/latest 1 of 250 tokens/i)).toBeInTheDocument()
  })
})
