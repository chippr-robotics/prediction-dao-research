import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// Mock the create flow so the panel renders deterministically (no chain/IPFS).
const createOpenChallenge = vi.fn()
vi.mock('../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

// Chain capability gate — flip per-test via this holder (drives the oracle pill).
const capsHolder = { capabilities: { polymarketSidebets: true }, chainId: 137 }
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: () => capsHolder }))

// Universal asset selector option list (spec 064 US3) — ERC-20 only for wager.
const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const WBTC1 = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const usdcOpt = { key: `137:${USDC.toLowerCase()}`, chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6, networkName: 'Polygon', balance: 100 }
const wethOpt = { key: '137:0xweth', chainId: 137, kind: 'erc20', address: '0xWeThPolygon000000000000000000000000000001', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, networkName: 'Polygon', balance: 4 }
const wbtcEthOpt = { key: `1:${WBTC1.toLowerCase()}`, chainId: 1, kind: 'erc20', address: WBTC1, symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8, networkName: 'Ethereum', balance: 1 }
const wagerAssets = { options: [usdcOpt, wethOpt, wbtcEthOpt], defaultKey: usdcOpt.key, isGasless: () => false }
vi.mock('../hooks/useSelectableAssets', () => ({
  useSelectableAssets: () => wagerAssets,
  default: () => wagerAssets,
}))

const switchHolder = { switchChainAsync: vi.fn(async () => {}), isPending: false }
vi.mock('wagmi', () => ({ useSwitchChain: () => switchHolder }))

// Stub the market browser: the panel's contract with it is onSelectMarket(normalizedMarket).
const FAR_END = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
const eligibleMarket = {
  id: 'm1', slug: 'will-eth-flip-btc', question: 'Will ETH flip BTC?',
  conditionId: '0xc0ffee', endDate: FAR_END, active: true, closed: false,
  outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
}
vi.mock('../components/fairwins/PolymarketBrowser', () => ({
  default: ({ onSelectMarket }) => (
    <div data-testid="pm-browser">
      <button type="button" onClick={() => onSelectMarket(eligibleMarket)}>pick eligible</button>
    </div>
  ),
}))

import CreateChallengePanel from '../components/fairwins/CreateChallengePanel'
import { OPEN_RESOLUTION_TYPES } from '../hooks/useOpenChallengeCreate'

const tapAmount = (amount) => {
  for (const ch of String(amount)) {
    fireEvent.click(screen.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch }))
  }
}
const pickStakeAsset = (name) => {
  fireEvent.click(screen.getByRole('button', { name: 'Stake asset' }))
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name }))
}

describe('CreateChallengePanel (spec 053 + spec 064 US3)', () => {
  beforeEach(() => {
    createOpenChallenge.mockReset()
    capsHolder.capabilities = { polymarketSidebets: true }
    capsHolder.chainId = 137
    wagerAssets.options = [usdcOpt, wethOpt, wbtcEthOpt]
    wagerAssets.defaultKey = usdcOpt.key
    switchHolder.switchChainAsync = vi.fn(async () => {})
  })

  it('renders inline when embedded (the payments-style create form, no modal chrome)', () => {
    const { container } = render(<CreateChallengePanel embedded onClose={() => {}} />)
    expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('$0')
    expect(screen.getByLabelText(/what's the wager/i, { selector: 'input' })).toBeInTheDocument()
    expect(container.querySelector('.friend-markets-modal-backdrop')).toBeNull()
    expect(container.querySelector('.oc-create-embedded')).not.toBeNull()
  })

  it('defaults the stake asset to USDC (unchanged first-render behavior)', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Stake asset' })).toHaveTextContent('USDC')
  })

  it('offers only ERC-20 stake assets in the selector (spec 064 US3)', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stake asset' }))
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: /USDC/ })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: /WETH/ })).toBeInTheDocument()
  })

  it('creates a self-resolved challenge denominated in the default USDC and calls onDone', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 1n, txHash: '0x1' })
    const onDone = vi.fn()
    render(<CreateChallengePanel embedded onClose={() => {}} onDone={onDone} />)
    const createBtn = screen.getByRole('button', { name: /lock in/i })
    expect(createBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    tapAmount('10')
    expect(createBtn).toBeEnabled()
    fireEvent.click(createBtn)
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    const payload = createOpenChallenge.mock.calls[0][0]
    expect(payload.resolutionType).toBe(OPEN_RESOLUTION_TYPES.Either)
    expect(payload.token).toBe(USDC) // stake token denomination (spec 064)
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
  })

  it('passes the selected stake token to the create hook (spec 064 US3)', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'aa bb cc dd', wagerId: 2n, txHash: '0x2' })
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    pickStakeAsset(/WETH/)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Coin flip' } })
    tapAmount('5')
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    expect(createOpenChallenge.mock.calls[0][0].token).toBe(wethOpt.address)
  })

  it('gates a wrong-network stake asset behind a switch and never creates off-chain (spec 064 US3)', async () => {
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    pickStakeAsset(/WBTC/) // WBTC lives on Ethereum (chain 1); connected to Polygon (137)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Coin flip' } })
    tapAmount('5')
    const switchBtn = screen.getByRole('button', { name: /switch to ethereum to stake WBTC/i })
    expect(screen.queryByRole('button', { name: /lock in/i })).toBeNull()
    fireEvent.click(switchBtn)
    await waitFor(() => expect(switchHolder.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 }))
    expect(createOpenChallenge).not.toHaveBeenCalled()
  })

  it('opens the connect flow from the primary button when disconnected, then resumes the create once connected', async () => {
    const onConnect = vi.fn()
    const { rerender } = render(
      <CreateChallengePanel embedded onClose={() => {}} isConnected={false} onConnect={onConnect} />
    )
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    tapAmount('10')
    const openBtn = screen.getByRole('button', { name: /lock in/i })
    expect(openBtn).toBeEnabled()
    fireEvent.click(openBtn)
    await waitFor(() => expect(onConnect).toHaveBeenCalled())
    expect(createOpenChallenge).not.toHaveBeenCalled()
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 1n, txHash: '0x1' })
    rerender(<CreateChallengePanel embedded onClose={() => {}} isConnected onConnect={onConnect} />)
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
  })

  it('locks the oracle resolution option where Polymarket is unavailable', () => {
    capsHolder.capabilities = { polymarketSidebets: false }
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    const oracle = screen.getByRole('radio', { name: /^event$/i })
    expect(oracle).toHaveAttribute('aria-disabled', 'true')
  })

  it('opens the market-search step when oracle is chosen, then returns with a side picker', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /^event$/i }))
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /taking yes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /taking no/i })).toBeInTheDocument()
  })

  it('preselects the oracle path + opens market search via initialResolutionType', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} initialResolutionType={OPEN_RESOLUTION_TYPES.Polymarket} />)
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
  })
})
