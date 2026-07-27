import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useChainId, useSwitchChain } from 'wagmi'
import NetworkPanel from '../../components/account/NetworkPanel'
import {
  getEndpointSettings,
  saveEndpointSettings,
  __resetEndpointStoreForTests,
} from '../../lib/network/endpointStore'

// The network panel, reached from the account button beside Preferences (spec 069). wagmi
// hooks are mocked globally in test/setup.js; we override per-test for chain state.

describe('NetworkPanel — network selector', () => {
  const switchChain = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useChainId.mockReturnValue(61) // unsupported chain → every network offers "Switch"
    useSwitchChain.mockReturnValue({
      switchChain,
      isPending: false,
      variables: undefined,
      error: null,
    })
  })

  it('lists the user-switchable networks', () => {
    render(<NetworkPanel />)
    expect(screen.getByText('Polygon')).toBeInTheDocument()
    expect(screen.getByText('Polygon Amoy')).toBeInTheDocument()
  })

  it('shows capability tags so members can make an informed switch', () => {
    render(<NetworkPanel />)
    // Each card renders the full capability set; assert the compliance + oracle tags.
    expect(screen.getAllByText('Sanctions Guard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Polymarket Oracle').length).toBeGreaterThan(0)
    expect(screen.getAllByText('UMA Oracle').length).toBeGreaterThan(0)
  })

  it('marks Token Swap available on mainnet but not on the testnet', () => {
    render(<NetworkPanel />)
    const polygonCard = screen.getByText('Polygon').closest('.network-card')
    const amoyCard = screen.getByText('Polygon Amoy').closest('.network-card')

    const polygonSwap = within(polygonCard).getByText('Token Swap').closest('.network-tag')
    const amoySwap = within(amoyCard).getByText('Token Swap').closest('.network-tag')

    expect(polygonSwap).toHaveClass('available')
    expect(amoySwap).toHaveClass('unavailable')
  })

  it('marks the connected network instead of offering a switch button', () => {
    useChainId.mockReturnValue(137)
    render(<NetworkPanel />)
    const polygonCard = screen.getByText('Polygon').closest('.network-card')
    expect(within(polygonCard).getByText('Connected')).toBeInTheDocument()
    expect(within(polygonCard).queryByRole('button', { name: /Switch to Polygon/ })).toBeNull()
  })

  it('switches chains through wagmi when a switch button is clicked', () => {
    render(<NetworkPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Polygon Amoy' }))
    expect(switchChain).toHaveBeenCalledWith({ chainId: 80002 })
  })

  it('lists Mordor (Ethereum Classic) as a selectable testnet', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    expect(card).toBeInTheDocument()
    expect(within(card).getByText('Testnet')).toBeInTheDocument()
  })

  it('switches to Mordor (chainId 63) through wagmi', () => {
    render(<NetworkPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Ethereum Classic Mordor' }))
    expect(switchChain).toHaveBeenCalledWith({ chainId: 63 })
  })

  it('marks oracle + swap features unavailable on Mordor (no oracle adapters, no DEX configured)', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    expect(within(card).getByText('Polymarket Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('Chainlink Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('UMA Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('Token Swap').closest('.network-tag')).toHaveClass('unavailable')
  })

  it('documents Mordor explorer and Classic USD stablecoin on the card', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    const explorer = within(card).getByRole('link', { name: 'Blockscout' })
    expect(explorer).toHaveAttribute('href', 'https://etc-mordor.blockscout.com')
    expect(explorer).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(card).getByText('Classic USD (USC)')).toBeInTheDocument()
  })

  // Spec 033 — the Network tab DEX link comes from the per-network dexProvider.
  it('lists Ethereum Classic (mainnet, chainId 61) as a selectable network', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Ethereum Classic').closest('.network-card')
    expect(card).toBeInTheDocument()
    expect(within(card).getByText('Mainnet')).toBeInTheDocument()
  })

  it('shows the ETCswap provider link on the Ethereum Classic card', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Ethereum Classic').closest('.network-card')
    const link = within(card).getByRole('link', { name: /Open ETCswap/ })
    expect(link).toHaveAttribute('href', 'https://v3.etcswap.org')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('shows the Uniswap provider link on the Polygon card', () => {
    render(<NetworkPanel />)
    const card = screen.getByText('Polygon').closest('.network-card')
    const link = within(card).getByRole('link', { name: /Open Uniswap/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('app.uniswap.org'))
  })

  // Spec 061 — Bitcoin renders as a DISPLAY-ONLY row (network-registry rule 2):
  // no wallet chain switch exists for a non-EVM network.
  describe('Bitcoin display-only rows (spec 061, FR-020)', () => {
    it('lists Bitcoin mainnet and its testnet pair without any switch affordance', () => {
      render(<NetworkPanel />)
      const mainnetCard = screen.getByText('Bitcoin').closest('.network-card')
      const testnetCard = screen.getByText('Bitcoin Testnet4').closest('.network-card')
      expect(mainnetCard).toBeInTheDocument()
      expect(within(mainnetCard).getByText('Mainnet')).toBeInTheDocument()
      expect(within(testnetCard).getByText('Testnet')).toBeInTheDocument()
      for (const card of [mainnetCard, testnetCard]) {
        expect(within(card).queryByRole('button', { name: /switch/i })).toBeNull()
        expect(within(card).getByText('No wallet switch')).toBeInTheDocument()
      }
    })

    it('states supported capabilities truthfully: portfolio, send, receive, Stamps collectibles', () => {
      render(<NetworkPanel />)
      const card = screen.getByText('Bitcoin').closest('.network-card')
      for (const label of ['Portfolio', 'Send', 'Receive', 'Stamps collectibles']) {
        expect(within(card).getByText(label).closest('.network-tag')).toHaveClass('available')
      }
    })

    it('states unsupported capabilities truthfully: wagers, pools, membership, gasless, swap, earn, predict', () => {
      render(<NetworkPanel />)
      const card = screen.getByText('Bitcoin').closest('.network-card')
      for (const label of ['P2P Wagers', 'Wager Pools', 'Memberships', 'Gasless', 'Token Swap', 'Earn', 'Predict']) {
        expect(within(card).getByText(label).closest('.network-tag')).toHaveClass('unavailable')
      }
    })

    it('discloses the wallet requirement and that members pay the Bitcoin network fee', () => {
      render(<NetworkPanel />)
      const card = screen.getByText('Bitcoin').closest('.network-card')
      expect(within(card).getByText(/Requires a FairWins passkey on a PRF-capable device/)).toBeInTheDocument()
      expect(within(card).getByText(/always pay the Bitcoin network fee/)).toBeInTheDocument()
    })

    it('documents the mempool.space explorer on the Bitcoin card', () => {
      render(<NetworkPanel />)
      const card = screen.getByText('Bitcoin').closest('.network-card')
      const link = within(card).getByRole('link', { name: 'mempool.space' })
      expect(link).toHaveAttribute('href', 'https://mempool.space')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })

    it('never routes a Bitcoin row through wagmi switchChain', () => {
      render(<NetworkPanel />)
      // Clicking around the Bitcoin card can produce no switchChain call —
      // there is no button — and the EVM switch buttons never carry a
      // bitcoin id.
      expect(switchChain).not.toHaveBeenCalled()
      for (const btn of screen.getAllByRole('button', { name: /^Switch to / })) {
        expect(btn.getAttribute('aria-label')).not.toMatch(/Bitcoin/)
      }
    })
  })
})

// Spec 069 — the panel is where a member takes ownership of the route their reads use.
describe('NetworkPanel — member RPC endpoints (spec 069)', () => {
  const MEMBER_RPC = 'https://polygon-mainnet.g.alchemy.com/v2/member-key'

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    __resetEndpointStoreForTests()
    useChainId.mockReturnValue(137)
    useSwitchChain.mockReturnValue({
      switchChain: vi.fn(),
      isPending: false,
      variables: undefined,
      error: null,
    })
  })

  const polygonCard = () => screen.getByText('Polygon').closest('.network-card')
  const openEditor = () => {
    fireEvent.click(within(polygonCard()).getByRole('button', { name: /Edit Polygon endpoints/ }))
    return polygonCard()
  }

  it('frames switching as optional because reads span every network', () => {
    render(<NetworkPanel />)
    expect(
      screen.getByText(/only need to switch when sending on a network your wallet is not/i),
    ).toBeInTheDocument()
  })

  it('shows which route a network is on before anything is configured', () => {
    render(<NetworkPanel />)
    expect(within(polygonCard()).getByText('App default')).toBeInTheDocument()
  })

  it('saves a member endpoint and reports it as theirs, redacted', () => {
    render(<NetworkPanel />)
    const card = openEditor()

    fireEvent.change(within(card).getByLabelText('RPC URL'), { target: { value: MEMBER_RPC } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }))

    expect(getEndpointSettings(137)).toMatchObject({ url: MEMBER_RPC })
    expect(within(polygonCard()).getByText('Your endpoint')).toBeInTheDocument()
    // The API key lives in the URL path — the summary row must never print it.
    expect(within(polygonCard()).getByText('https://polygon-mainnet.g.alchemy.com/…')).toBeInTheDocument()
    expect(polygonCard().textContent).not.toContain('member-key')
  })

  it('refuses to save an endpoint that serves a different chain', async () => {
    render(<NetworkPanel />)
    const card = openEditor()
    fireEvent.change(within(card).getByLabelText('RPC URL'), { target: { value: MEMBER_RPC } })

    // Answer the eth_chainId probe with Ethereum mainnet while editing Polygon.
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: '0x1' }) })
    fireEvent.click(within(card).getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(screen.getByText(/serves chain 1, not chain 137/)).toBeInTheDocument())

    fireEvent.click(within(polygonCard()).getByRole('button', { name: 'Save' }))
    expect(getEndpointSettings(137)).toBeNull()
  })

  it('warns when a pasted host is outside the app content-security policy', () => {
    render(<NetworkPanel />)
    const card = openEditor()
    fireEvent.change(within(card).getByLabelText('RPC URL'), {
      target: { value: 'https://rpc.my-own-node.example/eth' },
    })
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }))

    expect(screen.getByText(/will block requests to it/)).toBeInTheDocument()
    // It still saves — a member may be configuring ahead of a policy change.
    expect(getEndpointSettings(137)).toMatchObject({ url: 'https://rpc.my-own-node.example/eth' })
  })

  it('blocks a WebSocket endpoint with a reason instead of saving it', () => {
    render(<NetworkPanel />)
    const card = openEditor()
    fireEvent.change(within(card).getByLabelText('RPC URL'), {
      target: { value: 'wss://polygon-mainnet.g.alchemy.com/v2/k' },
    })
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }))

    expect(screen.getByText(/must be an HTTPS endpoint/)).toBeInTheDocument()
    expect(getEndpointSettings(137)).toBeNull()
  })

  it('masks the API key field and only reveals it on request', () => {
    render(<NetworkPanel />)
    const card = openEditor()
    fireEvent.change(within(card).getByLabelText('RPC URL'), { target: { value: MEMBER_RPC } })
    fireEvent.change(within(card).getByLabelText('Authentication'), { target: { value: 'bearer' } })

    const key = within(polygonCard()).getByLabelText('Key')
    expect(key).toHaveAttribute('type', 'password')
    fireEvent.click(within(polygonCard()).getByRole('button', { name: 'Show' }))
    expect(within(polygonCard()).getByLabelText('Key')).toHaveAttribute('type', 'text')
  })

  it('resets a network back to the app default', () => {
    saveEndpointSettings(137, { url: MEMBER_RPC })
    render(<NetworkPanel />)
    const card = openEditor()

    fireEvent.click(within(card).getByRole('button', { name: 'Reset to default' }))
    expect(getEndpointSettings(137)).toBeNull()
    expect(within(polygonCard()).getByText('App default')).toBeInTheDocument()
  })

  it('says plainly that wallet transactions need a reload to use a new endpoint', () => {
    render(<NetworkPanel />)
    const card = openEditor()
    fireEvent.change(within(card).getByLabelText('RPC URL'), { target: { value: MEMBER_RPC } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }))

    // Two disclosures, both honest: the save confirmation, and the panel-level banner.
    expect(screen.getByText(/Saved\. Reads use this route immediately/)).toBeInTheDocument()
    expect(
      screen.getByText(/Endpoint changes apply to new lookups right away/),
    ).toBeInTheDocument()
  })
})
