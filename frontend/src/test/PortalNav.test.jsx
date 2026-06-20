import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PortalNav from '../components/ui/PortalNav'

const ITEMS = [
  { id: 'account', label: 'Account' },
  { id: 'reports', label: 'Reporting' },
  { id: 'swap', label: 'Swap' },
]

describe('PortalNav (vertical sidebar tabs)', () => {
  it('renders a vertical tablist with every item', () => {
    render(<PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />)
    const list = screen.getByRole('tablist', { name: /account sections/i })
    expect(list).toHaveAttribute('aria-orientation', 'vertical')
    for (const item of ITEMS) {
      expect(screen.getByRole('tab', { name: item.label })).toBeInTheDocument()
    }
  })

  it('marks the active item with aria-selected', () => {
    render(<PortalNav items={ITEMS} activeId="reports" onSelect={vi.fn()} ariaLabel="Account sections" />)
    expect(screen.getByRole('tab', { name: 'Reporting' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onSelect with the item id when a tab is clicked', () => {
    const onSelect = vi.fn()
    render(<PortalNav items={ITEMS} activeId="account" onSelect={onSelect} ariaLabel="Account sections" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reporting' }))
    expect(onSelect).toHaveBeenCalledWith('reports')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
