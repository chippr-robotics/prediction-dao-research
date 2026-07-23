import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UniversalAssetSelect from '../UniversalAssetSelect'

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
