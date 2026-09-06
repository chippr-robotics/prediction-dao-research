import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { VERDICTS } from '../../lib/screening/verdict'

const A1 = '0x1111111111111111111111111111111111111111'

let estate = { status: 'idle', result: null }
vi.mock('../../hooks/useEstateScreening', () => ({
  useEstateScreening: () => estate,
}))

import AddressScreenNotice from '../../components/ui/AddressScreenNotice'

const reading = (chainId, label, flagged) => ({
  id: `${label}:${chainId}`, kind: 'k', label, chainId, address: '0x1', status: 'read', flagged, detail: flagged ? 'listed' : null,
})
const done = (verdict, readings, uncovered = []) => ({
  status: 'done',
  result: { address: A1, chainIds: [137, 1], readings, uncovered, verdict, readAt: 1 },
})

describe('AddressScreenNotice (issue #1458 — estate-wide)', () => {
  beforeEach(() => {
    estate = { status: 'idle', result: null }
  })

  it('renders nothing for an empty/invalid address', () => {
    const { container } = render(<AddressScreenNotice address="" chainId={137} />)
    expect(container).toBeEmptyDOMElement()
    const { container: c2 } = render(<AddressScreenNotice address="0x1234" chainId={137} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('shows a loading pill while the sweep runs — never a stale verdict', () => {
    estate = { status: 'loading', result: null }
    render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(screen.getByText('Screening…')).toBeInTheDocument()
    expect(screen.queryByText('Screened clear')).toBeNull()
  })

  it('renders a GREEN pill for a clear address — and says what that rests on', () => {
    estate = done(VERDICTS.SCREENED, [reading(137, 'FairWins sanctions guard', false), reading(1, 'Chainalysis sanctions oracle', false)])
    render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(screen.getByRole('button', { name: 'Screened clear' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Screened clear by 2 sources on 2 networks.')
  })

  it('alerts when any list flags the address, naming the list and network', () => {
    estate = done(VERDICTS.FLAGGED, [reading(137, 'FairWins sanctions guard', false), reading(1, 'Circle USDC freeze list', true)])
    render(<AddressScreenNotice address={A1} chainId={137} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('flagged by sanctions screening')
    expect(alert).toHaveTextContent('Circle USDC freeze list on Ethereum')
    expect(alert).toHaveAttribute('data-screen-verdict', 'flagged')
  })

  it('is amber, not green, when a source could not be read', () => {
    estate = done(VERDICTS.PARTIAL, [
      reading(137, 'FairWins sanctions guard', false),
      { id: 'o:1', kind: 'k', label: 'Chainalysis sanctions oracle', chainId: 1, address: '0x1', status: 'unreadable', reason: 'timed out' },
    ])
    render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(screen.getByRole('button', { name: 'Partly screened' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Not a clean bill')
  })

  it('says Unscreened when nothing could be asked', () => {
    estate = done(VERDICTS.UNSCREENED, [], [61])
    render(<AddressScreenNotice address={A1} chainId={61} />)
    expect(screen.getByRole('button', { name: 'Unscreened' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No screening source covers Ethereum Classic')
  })

  it('has no accessibility violations', async () => {
    estate = done(VERDICTS.FLAGGED, [reading(1, 'Chainalysis sanctions oracle', true)])
    const { container } = render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
