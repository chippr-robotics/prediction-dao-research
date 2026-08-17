/**
 * Spec 093 — the admin chart kit is honest by construction.
 *
 * Three primitives, one contract: a value renders only when it was actually
 * observed. An unreadable read never renders as a number, an empty series
 * renders an explicit empty state (never an invented flat line), and a
 * partial distribution names what is missing. Plus axe-cleanliness — these
 * are the visual anchors of every admin dashboard (constitution V).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import AdminSparkline from '../../components/admin/charts/AdminSparkline'
import AdminBarList from '../../components/admin/charts/AdminBarList'
import AdminStatTile from '../../components/admin/charts/AdminStatTile'
import { readOk, notDeployed, unreadable } from '../../lib/chains/chainReadResult'

describe('AdminSparkline', () => {
  const POINTS = [
    { x: 100, y: 0 },
    { x: 200, y: 5 },
    { x: 300, y: 12 },
  ]

  it('renders the series with an accessible name and a printed latest value', () => {
    render(
      <AdminSparkline
        points={POINTS}
        ariaLabel="Cumulative revenue reaching $12 over the scanned block window"
        caption="Cumulative revenue →"
        latestLabel="$12"
        hint="over scanned blocks"
      />,
    )
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('$12')).toBeInTheDocument()
    expect(screen.getByText(/over scanned blocks/)).toBeInTheDocument()
  })

  it('renders an explicit empty state below two points — never an invented line', () => {
    const { container } = render(
      <AdminSparkline points={[{ x: 1, y: 1 }]} ariaLabel="x" caption="y" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/No recorded activity/)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('is axe-clean', async () => {
    const { container } = render(
      <AdminSparkline points={POINTS} ariaLabel="Cumulative revenue" caption="Revenue →" latestLabel="$12" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('AdminBarList', () => {
  const ITEMS = [
    { label: 'Purchases', value: 12, display: '$12.00' },
    { label: 'Extensions', value: 4, display: '$4.00' },
  ]

  it('prints every value as text — the bar is emphasis, never the only encoding', () => {
    render(<AdminBarList items={ITEMS} ariaLabel="Revenue by stream" />)
    expect(screen.getByText('$12.00')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('names what a partial distribution is missing', () => {
    render(
      <AdminBarList
        items={ITEMS}
        ariaLabel="Revenue by stream"
        partial={{ missing: ['Mordor Testnet'] }}
      />,
    )
    expect(screen.getByRole('note')).toHaveTextContent(/Partial — Mordor Testnet could not be read/)
  })

  it('renders an explicit empty state for no items', () => {
    render(<AdminBarList items={[]} ariaLabel="Revenue by stream" />)
    expect(screen.getByRole('status')).toHaveTextContent(/No recorded activity/)
  })

  it('is axe-clean', async () => {
    const { container } = render(<AdminBarList items={ITEMS} ariaLabel="Revenue by stream" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('AdminStatTile — three-state, so a failed read has no number to become', () => {
  it('renders a read value (with caller formatting)', () => {
    render(<AdminStatTile label="Accrued" result={readOk(137, 1500000n)} display="1.5 USDC" />)
    expect(screen.getByText('1.5 USDC')).toBeInTheDocument()
  })

  it('renders unreadable as a sentence — never a zero, never a value style', () => {
    const { container } = render(<AdminStatTile label="Accrued" result={unreadable(137, 'down')} />)
    expect(screen.getByText('Could not be read')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\b/)
    expect(container.querySelector('.admin-stat-tile--unreadable')).not.toBeNull()
  })

  it('renders not-deployed as its own state, distinct from unreadable', () => {
    render(<AdminStatTile label="Accrued" result={notDeployed(63)} />)
    expect(screen.getByText('Not deployed')).toBeInTheDocument()
  })

  it('accepts a plain derived value when there is no chain read involved', () => {
    render(<AdminStatTile label="Queue" value={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('is axe-clean in every state', async () => {
    const { container } = render(
      <div>
        <AdminStatTile label="Read" result={readOk(137, 1n)} display="1" />
        <AdminStatTile label="Unreadable" result={unreadable(137, 'down')} />
        <AdminStatTile label="Absent" result={notDeployed(63)} />
      </div>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
