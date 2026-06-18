import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import WalletTabMenu from '../../components/wallet/WalletTabMenu'

const TABS = [
  { id: 'account', label: 'Account' },
  { id: 'reports', label: 'Reporting' },
  { id: 'swap', label: 'Swap' },
]

describe('WalletTabMenu (kebab section menu)', () => {
  it('shows the active section on the trigger and is collapsed by default', () => {
    render(<WalletTabMenu tabs={TABS} activeTab="reports" onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /wallet sections menu/i })
    expect(trigger).toHaveTextContent('Reporting')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu listing every section', () => {
    render(<WalletTabMenu tabs={TABS} activeTab="account" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /wallet sections menu/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    for (const t of TABS) {
      expect(screen.getByRole('menuitemradio', { name: t.label })).toBeInTheDocument()
    }
  })

  it('selects a section and closes', () => {
    const onChange = vi.fn()
    render(<WalletTabMenu tabs={TABS} activeTab="account" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /wallet sections menu/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Reporting' }))
    expect(onChange).toHaveBeenCalledWith('reports')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks the active section with aria-checked', () => {
    render(<WalletTabMenu tabs={TABS} activeTab="reports" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /wallet sections menu/i }))
    expect(screen.getByRole('menuitemradio', { name: 'Reporting' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Account' })).toHaveAttribute('aria-checked', 'false')
  })

  it('closes on Escape', () => {
    render(<WalletTabMenu tabs={TABS} activeTab="account" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /wallet sections menu/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('has no axe violations (open)', async () => {
    const { container } = render(<WalletTabMenu tabs={TABS} activeTab="reports" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /wallet sections menu/i }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
