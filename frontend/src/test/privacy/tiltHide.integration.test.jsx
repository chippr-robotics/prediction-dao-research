import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const prefs = vi.hoisted(() => ({ tiltToHide: true }))
vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: { tiltToHide: prefs.tiltToHide } }),
}))

import { PrivacyProvider } from '../../contexts/PrivacyContext.jsx'
import SensitiveValue from '../../components/common/SensitiveValue'

/** A miniature "money screen": three monetary figures + one non-monetary count. */
function MoneyScreen() {
  return (
    <div>
      <SensitiveValue>$1,000.00</SensitiveValue>
      <SensitiveValue className="total">$2,500.00</SensitiveValue>
      <SensitiveValue>0.5 ETH</SensitiveValue>
      <span data-testid="count">3 participants</span>
    </div>
  )
}

function renderScreen(ui = <MoneyScreen />) {
  return render(<PrivacyProvider>{ui}</PrivacyProvider>)
}

describe('tilt-to-hide end-to-end (spec 047, US1)', () => {
  beforeEach(() => {
    prefs.tiltToHide = true
    delete window.DeviceOrientationEvent.requestPermission
  })

  it('masks every monetary value when flat and reveals them when lifted', () => {
    const { container } = renderScreen()
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()

    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 })) // flat
    expect(screen.queryByText('$1,000.00')).not.toBeInTheDocument()
    expect(screen.queryByText('$2,500.00')).not.toBeInTheDocument()
    expect(screen.queryByText('0.5 ETH')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('1,000.00')
    // Non-monetary content stays legible.
    expect(screen.getByTestId('count').textContent).toBe('3 participants')

    act(() => global.dispatchOrientation({ beta: 70, gamma: 0 })) // viewing
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$2,500.00')).toBeInTheDocument()
  })

  it('renders masked from the first paint when the device starts flat (no flash)', () => {
    // Lay flat before any values mount: prime the provider by dispatching while
    // an initial subscriber is present, then mount the money screen.
    const { rerender } = render(
      <PrivacyProvider>
        <span>warmup</span>
      </PrivacyProvider>,
    )
    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 })) // flat
    rerender(
      <PrivacyProvider>
        <MoneyScreen />
      </PrivacyProvider>,
    )
    // Values mounted while already flat must not appear.
    expect(screen.queryByText('$1,000.00')).not.toBeInTheDocument()
  })

  it('masks values that mount after the device is already flat', () => {
    const { rerender } = renderScreen(<div />)
    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 })) // flat
    rerender(
      <PrivacyProvider>
        <MoneyScreen />
      </PrivacyProvider>,
    )
    expect(screen.queryByText('$2,500.00')).not.toBeInTheDocument()
  })
})
