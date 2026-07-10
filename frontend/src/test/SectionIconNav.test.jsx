import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Force the mobile branch — SectionIconNav renders only on mobile.
vi.mock('../hooks/useMediaQuery', () => ({
  useIsMobile: () => true,
}))

import SectionIconNav from '../components/nav/SectionIconNav'

const ITEMS = [
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'paytransfer', label: 'Pay & Transfer', icon: 'transfer' },
  { id: 'custody', label: 'Protect', icon: 'shield' },
]

describe('SectionIconNav (mobile bottom quick-nav)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one button per sibling item with its label', () => {
    render(<SectionIconNav items={ITEMS} activeId="trade" onSelect={vi.fn()} ariaLabel="Finance sections" />)
    const nav = screen.getByRole('navigation', { name: /finance sections/i })
    expect(nav).toBeInTheDocument()
    for (const item of ITEMS) {
      expect(screen.getByRole('button', { name: new RegExp(item.label, 'i') })).toBeInTheDocument()
    }
  })

  it('marks the active item with aria-current', () => {
    render(<SectionIconNav items={ITEMS} activeId="custody" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /protect/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /trade/i })).not.toHaveAttribute('aria-current')
  })

  it('calls onSelect with the item id when tapped', () => {
    const onSelect = vi.fn()
    render(<SectionIconNav items={ITEMS} activeId="trade" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /pay & transfer/i }))
    expect(onSelect).toHaveBeenCalledWith('paytransfer')
  })

  it('renders nothing when there is only one sibling (nothing to switch to)', () => {
    const { container } = render(
      <SectionIconNav items={[ITEMS[0]]} activeId="trade" onSelect={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
