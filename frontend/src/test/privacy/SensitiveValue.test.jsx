import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SensitiveValue from '../../components/common/SensitiveValue'
import { PrivacyContext } from '../../contexts/PrivacyContext.js'

function renderWith(hidden, ui) {
  const value = {
    hidden,
    enabled: true,
    support: 'supported',
    permission: 'granted',
    requestMotionPermission: async () => 'granted',
  }
  return render(<PrivacyContext.Provider value={value}>{ui}</PrivacyContext.Provider>)
}

describe('SensitiveValue (spec 046)', () => {
  it('renders the exact value when not hidden', () => {
    renderWith(false, <SensitiveValue className="amt">$1,234.56</SensitiveValue>)
    expect(screen.getByText('$1,234.56')).toBeInTheDocument()
  })

  it('does not put the real value in the DOM when hidden (not copyable)', () => {
    const { container } = renderWith(true, <SensitiveValue>$1,234.56</SensitiveValue>)
    expect(screen.queryByText('$1,234.56')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('1,234.56')
  })

  it('exposes a "hidden" accessible name, not the value, when masked', () => {
    renderWith(true, <SensitiveValue>$1,234.56</SensitiveValue>)
    // The masked element is reachable by its accessible name.
    expect(screen.getByLabelText('hidden')).toBeInTheDocument()
  })

  it('uses a constant placeholder that does not encode digit count', () => {
    const big = renderWith(true, <SensitiveValue>$9,999,999.99</SensitiveValue>)
    const bigText = big.container.textContent
    big.unmount()
    const small = renderWith(true, <SensitiveValue>$1</SensitiveValue>)
    expect(small.container.textContent).toBe(bigText)
  })

  it('forwards className and honors the `as` prop', () => {
    const { container } = renderWith(
      false,
      <SensitiveValue as="div" className="portfolio-row-usd">$5</SensitiveValue>,
    )
    const el = container.querySelector('div.portfolio-row-usd')
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('$5')
  })

  it('shows values (no mask) when rendered without a PrivacyProvider', () => {
    render(<SensitiveValue>$42.00</SensitiveValue>)
    expect(screen.getByText('$42.00')).toBeInTheDocument()
  })
})
