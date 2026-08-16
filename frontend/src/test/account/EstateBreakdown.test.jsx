import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import EstateBreakdown from '../../components/account/EstateBreakdown'

const portfolio = (over = {}) => ({
  status: 'ready',
  holdings: [
    { network: 'Polygon', balance: 100, usd: 100, asset: { id: 'usdc' } },
    { network: 'Mordor Testnet', balance: 5000, usd: 11455.68, asset: { id: 'metc' } },
  ],
  categories: [
    { category: { id: 'network-assets', label: 'Network Assets' }, aggregates: [{ balance: 5000 }], subtotalUsd: 11455.68 },
    { category: { id: 'payment-stablecoins', label: 'Payment Stablecoins' }, aggregates: [{ balance: 100 }], subtotalUsd: 100 },
  ],
  totalUsd: 11555.68,
  failedAssets: [],
  ...over,
})

describe('EstateBreakdown (account estate overview)', () => {
  it('shows the estate total and per-network / per-asset-class subtotals', () => {
    render(<EstateBreakdown portfolio={portfolio()} />)
    expect(screen.getByText(/across your estate/i)).toBeInTheDocument()
    // formatUsd is the app-wide compact form: $11,555.68 → "$11.6K".
    expect(screen.getByText('$11.6K')).toBeInTheDocument()
    const byNetwork = screen.getByRole('list', { name: /estate value by network/i })
    expect(within(byNetwork).getByText('Mordor Testnet')).toBeInTheDocument()
    expect(within(byNetwork).getByText('Polygon')).toBeInTheDocument()
    const byClass = screen.getByRole('list', { name: /estate value by asset class/i })
    expect(within(byClass).getByText('Network Assets')).toBeInTheDocument()
    expect(within(byClass).getByText('Payment Stablecoins')).toBeInTheDocument()
  })

  it('discloses failed reads instead of summing them as zero', () => {
    render(<EstateBreakdown portfolio={portfolio({ failedAssets: ['BTC'] })} />)
    expect(screen.getByText(/could not read: BTC/i)).toBeInTheDocument()
  })

  it('discloses unpriced holdings excluded from USD figures', () => {
    render(
      <EstateBreakdown
        portfolio={portfolio({
          holdings: [
            { network: 'Mordor Testnet', balance: 3, usd: null, asset: { id: 'x' } },
            { network: 'Polygon', balance: 1, usd: 1, asset: { id: 'usdc' } },
          ],
        })}
      />,
    )
    expect(screen.getByText(/1 holding without an on-chain price is excluded/i)).toBeInTheDocument()
  })

  it('says the scan is still running rather than rendering empty rows', () => {
    render(<EstateBreakdown portfolio={portfolio({ status: 'loading', holdings: [], categories: [], totalUsd: 0 })} />)
    expect(screen.getByText(/reading balances across your networks/i)).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('renders an honest error state, never zeros', () => {
    render(<EstateBreakdown portfolio={portfolio({ status: 'error', holdings: [], categories: [], totalUsd: 0 })} />)
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('renders nothing while disconnected', () => {
    const { container } = render(<EstateBreakdown portfolio={portfolio({ status: 'disconnected' })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
