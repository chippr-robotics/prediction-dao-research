import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import UniversalAssetSelect from '../UniversalAssetSelect'
import { samePair, bridgeDest } from '../../../lib/assets/networkPin'

// SensitiveValue reads a privacy context — stub it to render children verbatim.
vi.mock('../../common/SensitiveValue', () => ({
  default: ({ children }) => <span>{children}</span>,
}))
// AssetLogo renders inline SVG; stub to a testable marker carrying its props.
vi.mock('../../wallet/AssetLogo', () => ({
  default: ({ symbol, chainId }) => (
    <span data-testid="asset-logo" data-symbol={symbol} data-chain={String(chainId)} aria-hidden="true" />
  ),
}))

const USDC = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
const OPTIONS = [
  { key: '137:native', chainId: 137, kind: 'native', symbol: 'MATIC', networkName: 'Polygon', balance: 5 },
  { key: `137:${USDC}`, chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', networkName: 'Polygon', balance: 100 },
  { key: '1:0xwbtc', chainId: 1, kind: 'erc20', address: '0xwbtc', symbol: 'WBTC', networkName: 'Ethereum', balance: null },
  { key: 'bitcoin:native', chainId: 'bitcoin', kind: 'btc-native', symbol: 'BTC', networkName: 'Bitcoin', balance: 0.25 },
]

describe('UniversalAssetSelect', () => {
  it('renders the selected asset with a nested logo and network', () => {
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Asset' })
    expect(within(trigger).getByTestId('asset-logo')).toHaveAttribute('data-symbol', 'MATIC')
    expect(trigger).toHaveTextContent('Polygon')
  })

  it('opens a listbox with one nested logo per option and symbol+network text', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    const list = screen.getByRole('listbox')
    const opts = within(list).getAllByRole('option')
    expect(opts).toHaveLength(4)
    // Each option row shows a nested logo + its symbol + network.
    expect(within(list).getAllByTestId('asset-logo')).toHaveLength(4)
    expect(within(list).getByText('WBTC')).toBeInTheDocument()
    expect(within(list).getByText('Ethereum')).toBeInTheDocument()
  })

  it('passes an EVM chainId to the logo but null for a Bitcoin (string-id) option', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    const list = screen.getByRole('listbox')
    const logos = within(list).getAllByTestId('asset-logo')
    const btc = logos.find((l) => l.getAttribute('data-symbol') === 'BTC')
    const usdc = logos.find((l) => l.getAttribute('data-symbol') === 'USDC')
    expect(btc).toHaveAttribute('data-chain', 'null')
    expect(usdc).toHaveAttribute('data-chain', '137')
  })

  it('shows a pending indicator (not 0) for a null balance', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    const wbtcOption = screen.getByRole('option', { name: /WBTC/ })
    expect(within(wbtcOption).getByLabelText('balance loading')).toBeInTheDocument()
    expect(wbtcOption).not.toHaveTextContent('Balance: 0')
  })

  it('marks only gasless options with ⚡', async () => {
    const user = userEvent.setup()
    const isGasless = (o) => Number(o.chainId) === 137
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} isGasless={isGasless} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    expect(screen.getAllByLabelText('gasless')).toHaveLength(2) // MATIC + USDC on Polygon
  })

  it('fires onChange with the full option and closes on select', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    await user.click(screen.getByRole('option', { name: /USDC/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ key: `137:${USDC}`, symbol: 'USDC' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={OPTIONS} value="137:native" onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('disables the trigger and shows an empty state when there are no options', () => {
    render(<UniversalAssetSelect options={[]} onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Asset' })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveTextContent('No assets available')
  })
})

// ---------------------------------------------------------------------------
// Spec 067 (research R11) — search + network pinning.
// ---------------------------------------------------------------------------

const ETH_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const ARB_USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'

// The list these two additions exist for: one asset held on several networks, plus a
// same-network sibling and a non-EVM holding.
const CROSS = [
  { key: `137:${USDC}`, chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', name: 'USD Coin', networkName: 'Polygon', balance: 100 },
  { key: `1:${ETH_USDC}`, chainId: 1, kind: 'erc20', address: ETH_USDC, symbol: 'USDC', name: 'USD Coin', networkName: 'Ethereum', balance: 40 },
  { key: `42161:${ARB_USDC}`, chainId: 42161, kind: 'erc20', address: ARB_USDC, symbol: 'USDC', name: 'USD Coin', networkName: 'Arbitrum One', balance: 7 },
  { key: '137:native', chainId: 137, kind: 'native', symbol: 'MATIC', name: 'Polygon Ecosystem Token', networkName: 'Polygon', balance: 5 },
  { key: 'bitcoin:native', chainId: 'bitcoin', kind: 'btc-native', symbol: 'BTC', name: 'Bitcoin', networkName: 'Bitcoin', balance: 0.25 },
]

/** A pin on Polygon USDC — the shape `lib/assets/networkPin.js#createPin` produces. */
const POLYGON_USDC_PIN = {
  pinnedChainId: 137,
  pinnedSymbol: 'USDC',
  pinnedNetworkName: 'Polygon',
  pinnedKey: `137:${USDC}`,
}

const openList = async (user, name = 'Asset') => {
  await user.click(screen.getByRole('button', { name }))
  return screen.queryByRole('listbox')
}

const optionNames = () =>
  screen.getAllByRole('option').map((o) => o.textContent.replace(/\s+/g, ' ').trim())

describe('UniversalAssetSelect — search (spec 067 FR-064)', () => {
  it('exposes a labelled search field that takes focus when the list opens', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    const search = screen.getByRole('searchbox', { name: 'Search assets' })
    expect(search).toBeInTheDocument()
    expect(search).toHaveFocus()
  })

  it('narrows by asset symbol', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'matic')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(optionNames()[0]).toContain('MATIC')
  })

  it('narrows by asset name, which is never rendered as text', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'usd coin')
    // The three USDC rows across Polygon / Ethereum / Arbitrum, and nothing else.
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.queryByRole('option', { name: /MATIC/ })).not.toBeInTheDocument()
  })

  it('narrows by network name', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'arbitrum')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(optionNames()[0]).toContain('Arbitrum One')
  })

  it('states that nothing matched instead of showing an empty list', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'dogecoin')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/No assets match “dogecoin”/)
  })

  it('announces the narrowing in a live region for screen readers', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    expect(screen.getByRole('status')).toHaveTextContent('5 of 5 assets shown')
    await user.type(screen.getByRole('searchbox'), 'polygon')
    expect(screen.getByRole('status')).toHaveTextContent('2 of 5 assets shown')
  })

  it('does not change the selected asset shown on the trigger while typing', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value="137:native" onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'arbitrum')
    expect(screen.getByRole('button', { name: 'Asset' })).toHaveTextContent('MATIC')
  })

  it('is keyboard operable: ArrowDown enters the list, ArrowUp returns to the field', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    const search = screen.getByRole('searchbox')
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option')[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(search).toHaveFocus()
  })

  it('commits the top match on Enter rather than submitting a surrounding form', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={onChange} />
      </form>,
    )
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'arbitrum{Enter}')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ key: `42161:${ARB_USDC}` }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clears the query and returns focus to the trigger on Escape', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />)
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'arbitrum')
    await user.keyboard('{Escape}')
    const trigger = screen.getByRole('button', { name: 'Asset' })
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(5)
  })
})

describe('UniversalAssetSelect — pin filtering (spec 067 FR-062/FR-063)', () => {
  it('offers only the same asset on OTHER networks under the bridge predicate', async () => {
    const user = userEvent.setup()
    render(
      <UniversalAssetSelect
        options={CROSS}
        onChange={() => {}}
        label="Destination"
        pin={POLYGON_USDC_PIN}
        pinPredicate={bridgeDest}
      />,
    )
    await openList(user, 'Destination')
    const names = optionNames()
    expect(names).toHaveLength(2)
    expect(names.join(' ')).toContain('Ethereum')
    expect(names.join(' ')).toContain('Arbitrum One')
    // Never the source network (that would be a same-chain transfer), never another
    // asset, never a non-EVM holding.
    expect(names.join(' ')).not.toContain('Polygon')
    expect(screen.queryByRole('option', { name: /MATIC/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /BTC/ })).not.toBeInTheDocument()
  })

  it('offers only the pinned network under the pair predicate — the exact inverse', async () => {
    const user = userEvent.setup()
    render(
      <UniversalAssetSelect
        options={CROSS}
        onChange={() => {}}
        label="Second asset"
        pin={POLYGON_USDC_PIN}
        pinPredicate={samePair}
      />,
    )
    await openList(user, 'Second asset')
    const names = optionNames()
    expect(names).toHaveLength(2) // Polygon USDC + Polygon MATIC
    expect(names.every((n) => n.includes('Polygon'))).toBe(true)
    expect(screen.queryByRole('option', { name: /Bitcoin/ })).not.toBeInTheDocument()
  })

  it('applies the caller-supplied predicate verbatim and derives no eligibility of its own', async () => {
    const user = userEvent.setup()
    // A deliberately arbitrary rule: nothing about it is derivable from the options.
    const onlyBitcoin = vi.fn((o) => o.symbol === 'BTC')
    render(
      <UniversalAssetSelect options={CROSS} onChange={() => {}} pin={POLYGON_USDC_PIN} pinPredicate={onlyBitcoin} />,
    )
    await openList(user)
    expect(optionNames()).toEqual([expect.stringContaining('BTC')])
    // Called as (option, pin) — the signature lib/assets/networkPin.js exports.
    expect(onlyBitcoin).toHaveBeenCalledWith(CROSS[0], POLYGON_USDC_PIN)
  })

  it('composes with search: the pin bounds the list, the query narrows it', async () => {
    const user = userEvent.setup()
    render(
      <UniversalAssetSelect
        options={CROSS}
        onChange={() => {}}
        pin={POLYGON_USDC_PIN}
        pinPredicate={bridgeDest}
      />,
    )
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'ethereum')
    expect(optionNames()).toEqual([expect.stringContaining('Ethereum')])
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 assets shown')
  })

  it('selects the first eligible option when the incoming value is excluded by the pin', () => {
    render(
      <UniversalAssetSelect
        options={CROSS}
        value={`137:${USDC}`} // the source asset — not a valid destination
        onChange={() => {}}
        pin={POLYGON_USDC_PIN}
        pinPredicate={bridgeDest}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Asset' })
    expect(trigger).toHaveTextContent('Ethereum')
    expect(trigger).not.toHaveTextContent('Polygon')
  })

  it('is backwards compatible: a pin with no predicate filters nothing', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} pin={POLYGON_USDC_PIN} />)
    await openList(user)
    expect(screen.getAllByRole('option')).toHaveLength(5)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('UniversalAssetSelect — empty counterpart (spec 067 FR-065)', () => {
  // WBTC is held on Ethereum only, so nothing can be its bridge destination.
  const WBTC_PIN = {
    pinnedChainId: 1,
    pinnedSymbol: 'WBTC',
    pinnedNetworkName: 'Ethereum',
    pinnedKey: '1:0xwbtc',
  }

  it('states why the list is empty and what would change it, next to the disabled control', () => {
    render(
      <UniversalAssetSelect options={CROSS} onChange={() => {}} pin={WBTC_PIN} pinPredicate={bridgeDest} />,
    )
    const trigger = screen.getByRole('button', { name: 'Asset' })
    expect(trigger).toBeDisabled()
    // Not the misleading "No assets available" — assets exist, none qualify.
    expect(trigger).toHaveTextContent('No eligible asset')
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('WBTC on Ethereum')
    expect(note).toHaveTextContent(/Choose a different asset above, or add one that qualifies/)
    // The reason is programmatically tied to the control, not merely nearby.
    expect(trigger).toHaveAttribute('aria-describedby', note.getAttribute('id'))
  })

  it('renders the caller-supplied explanation when given one', () => {
    render(
      <UniversalAssetSelect
        options={CROSS}
        onChange={() => {}}
        pin={WBTC_PIN}
        pinPredicate={bridgeDest}
        pinEmptyMessage="You hold WBTC on Ethereum only. Bridging needs the same asset on another network."
      />,
    )
    expect(screen.getByRole('note')).toHaveTextContent(
      'You hold WBTC on Ethereum only. Bridging needs the same asset on another network.',
    )
  })

  it('never opens a bare empty dropdown', async () => {
    const user = userEvent.setup()
    render(<UniversalAssetSelect options={CROSS} onChange={() => {}} pin={WBTC_PIN} pinPredicate={bridgeDest} />)
    await user.click(screen.getByRole('button', { name: 'Asset' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('keeps the pre-067 wording when there are genuinely no options at all', () => {
    render(<UniversalAssetSelect options={[]} onChange={() => {}} pin={WBTC_PIN} pinPredicate={bridgeDest} />)
    expect(screen.getByRole('button', { name: 'Asset' })).toHaveTextContent('No assets available')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('UniversalAssetSelect — accessibility', () => {
  it('has no violations when closed', async () => {
    const { container } = render(
      <UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with the list open and searchable', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />,
    )
    await openList(user)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in the no-match state', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <UniversalAssetSelect options={CROSS} value={`137:${USDC}`} onChange={() => {}} />,
    )
    await openList(user)
    await user.type(screen.getByRole('searchbox'), 'dogecoin')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in the empty-counterpart state', async () => {
    const { container } = render(
      <UniversalAssetSelect
        options={CROSS}
        onChange={() => {}}
        pin={{ pinnedChainId: 1, pinnedSymbol: 'WBTC', pinnedNetworkName: 'Ethereum' }}
        pinPredicate={bridgeDest}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
