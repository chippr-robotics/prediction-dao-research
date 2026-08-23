import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import DevelopmentWarningBanner from '../components/ui/DevelopmentWarningBanner'

/**
 * Issue #1248 — the banner is `position: fixed` and reserves its space through
 * `--dev-banner-height`. That reservation used to be the constant '45px', which assumed the copy
 * fit on one line; at 390px it wraps to roughly three and the banner then covered the fixed
 * controls beneath it. These tests pin the property to the OBSERVED size, so no width has a
 * "right" constant to drift back to.
 */

const DISMISSED_KEY = 'dev_warning_banner_dismissed'

function reservedHeight() {
  return document.documentElement.style.getPropertyValue('--dev-banner-height')
}

/** Every element measures as `height` px until the stub is changed. */
function stubRectHeight(height) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 390, bottom: height, width: 390, height,
    toJSON: () => ({}),
  })
}

/** A ResizeObserver whose callback the test drives, replacing setup.js's no-op mock. */
const observers = []
class ControllableResizeObserver {
  constructor(callback) {
    this.callback = callback
    this.targets = []
    this.disconnected = false
    observers.push(this)
  }

  observe(target) { this.targets.push(target) }
  unobserve(target) { this.targets = this.targets.filter((t) => t !== target) }
  disconnect() { this.targets = []; this.disconnected = true }

  /** Report a new border-box height for everything this observer watches. */
  emit(blockSize) {
    act(() => {
      this.callback(
        this.targets.map((target) => ({
          target,
          borderBoxSize: [{ blockSize, inlineSize: 390 }],
          contentRect: { height: blockSize, width: 390 },
        })),
        this,
      )
    })
  }
}

beforeEach(() => {
  observers.length = 0
  localStorage.clear()
  document.documentElement.style.removeProperty('--dev-banner-height')
  vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.style.removeProperty('--dev-banner-height')
})

describe('DevelopmentWarningBanner reserved offset', () => {
  it('reserves the height it actually renders, not a constant', () => {
    // A three-line banner at a phone width — the case that broke.
    stubRectHeight(132)
    render(<DevelopmentWarningBanner />)

    expect(reservedHeight()).toBe('132px')
    expect(reservedHeight()).not.toBe('45px')
  })

  it('tracks the observed size when the banner reflows', () => {
    stubRectHeight(132)
    render(<DevelopmentWarningBanner />)
    expect(reservedHeight()).toBe('132px')

    // Rotated to a width where the copy fits on one line.
    expect(observers).toHaveLength(1)
    observers[0].emit(44)
    expect(reservedHeight()).toBe('44px')

    // ...and back to a wrapped layout.
    observers[0].emit(132)
    expect(reservedHeight()).toBe('132px')
  })

  it('observes the banner element itself', () => {
    stubRectHeight(60)
    render(<DevelopmentWarningBanner />)

    expect(observers[0].targets).toHaveLength(1)
    // Reference check, not deep equality: this must be the banner node itself.
    expect(observers[0].targets[0]).toBe(screen.getByTestId('dev-warning-banner'))
  })

  it('rounds a fractional height up — a sub-pixel shortfall is a sub-pixel overlap', () => {
    stubRectHeight(100)
    render(<DevelopmentWarningBanner />)

    observers[0].emit(100.2)
    expect(reservedHeight()).toBe('101px')
  })

  it('falls back to measuring the element when the entry carries no border box', () => {
    stubRectHeight(88)
    render(<DevelopmentWarningBanner />)
    expect(reservedHeight()).toBe('88px')

    stubRectHeight(120)
    act(() => {
      observers[0].callback([{ target: screen.getByTestId('dev-warning-banner') }], observers[0])
    })
    expect(reservedHeight()).toBe('120px')
  })

  it('measures on window resize when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    stubRectHeight(132)
    render(<DevelopmentWarningBanner />)
    expect(reservedHeight()).toBe('132px')

    stubRectHeight(44)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(reservedHeight()).toBe('44px')
  })

  it('releases the reservation and the observer on unmount', () => {
    stubRectHeight(132)
    const { unmount } = render(<DevelopmentWarningBanner />)
    const observer = observers[0]

    unmount()

    expect(reservedHeight()).toBe('')
    expect(observer.disconnected).toBe(true)
  })
})

describe('DevelopmentWarningBanner dismissal', () => {
  it('dismissing hides the banner, reserves nothing and persists the flag', () => {
    stubRectHeight(132)
    render(<DevelopmentWarningBanner />)

    fireEvent.click(screen.getByRole('button', { name: /dismiss warning banner/i }))

    expect(screen.queryByTestId('dev-warning-banner')).toBeNull()
    expect(reservedHeight()).toBe('0px')
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true')
  })

  it('starts dismissed when the e2e seam is set, reserving 0px', () => {
    // cypress/support sets this from window:before:load so specs are not fighting a dev-only banner.
    localStorage.setItem(DISMISSED_KEY, 'true')
    stubRectHeight(132)

    const { container } = render(<DevelopmentWarningBanner />)

    expect(container).toBeEmptyDOMElement()
    expect(reservedHeight()).toBe('0px')
    expect(observers).toHaveLength(0)
  })
})
