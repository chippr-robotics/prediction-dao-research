import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import Button from '../components/ui/Button'
import StatusIndicator from '../components/ui/StatusIndicator'

// Mock the open-challenge flow hooks so OpenChallengeModal renders deterministically
// for the accessibility checks below (no chain/IPFS). Mirrors
// src/test/claimCode/OpenChallengeModal.test.jsx. vi.mock is hoisted above imports.
const createOpenChallenge = vi.fn()
const discover = vi.fn()
const accept = vi.fn()
vi.mock('../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})
vi.mock('../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ discover, accept, busy: false, error: null }),
}))

import OpenChallengeModal from '../components/fairwins/OpenChallengeModal'

/**
 * Accessibility tests for UI components
 * Ensures WCAG 2.1 AA compliance
 */

describe('Accessibility Compliance Tests', () => {
  describe('Button Accessibility', () => {
    it('has no axe violations for primary button', async () => {
      const { container } = render(<Button>Primary Button</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for secondary button', async () => {
      const { container } = render(<Button variant="secondary">Secondary Button</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for disabled button', async () => {
      const { container } = render(<Button disabled>Disabled Button</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for loading button', async () => {
      const { container } = render(<Button loading>Loading Button</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for icon-only button with aria-label', async () => {
      const { container } = render(<Button ariaLabel="Close">×</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('StatusIndicator Accessibility', () => {
    it('has no axe violations for active status', async () => {
      const { container } = render(<StatusIndicator status="active" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for pending status', async () => {
      const { container } = render(<StatusIndicator status="pending" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for failed status', async () => {
      const { container } = render(<StatusIndicator status="failed" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations for all status types', async () => {
      const statuses = ['active', 'pending', 'reviewing', 'cancelled', 'executed', 'forfeited', 'completed', 'failed']
      
      for (const status of statuses) {
        const { container, unmount } = render(<StatusIndicator status={status} />)
        const results = await axe(container)
        expect(results).toHaveNoViolations()
        unmount()
      }
    })
  })

  describe('WCAG Compliance Rules', () => {
    it('ensures color contrast meets WCAG AA standards', async () => {
      // axe will check color-contrast rule by default
      const { container } = render(
        <div>
          <Button>High Contrast Button</Button>
          <StatusIndicator status="active" />
        </div>
      )
      
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true }
        }
      })
      
      expect(results).toHaveNoViolations()
    })

    it('ensures all interactive elements are keyboard accessible', async () => {
      const { container } = render(
        <div>
          <Button>Keyboard Accessible</Button>
          <Button variant="secondary">Another Button</Button>
        </div>
      )
      
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('ensures proper ARIA attributes', async () => {
      const { container } = render(
        <div>
          <Button loading ariaLabel="Submitting form">Submit</Button>
          <StatusIndicator status="pending" />
        </div>
      )
      
      const results = await axe(container, {
        rules: {
          'aria-allowed-attr': { enabled: true },
          'aria-required-attr': { enabled: true },
          'aria-valid-attr': { enabled: true },
          'aria-valid-attr-value': { enabled: true }
        }
      })
      
      expect(results).toHaveNoViolations()
    })

    it('ensures proper semantic HTML', async () => {
      const { container } = render(
        <div>
          <Button>Semantic Button</Button>
        </div>
      )
      
      const results = await axe(container, {
        rules: {
          'button-name': { enabled: true },
          'empty-heading': { enabled: true }
        }
      })
      
      expect(results).toHaveNoViolations()
    })
  })

  describe('Keyboard Navigation', () => {
    it('buttons are focusable', () => {
      const { container } = render(<Button>Focusable</Button>)
      const button = container.querySelector('button')
      
      expect(button).not.toBeNull()
      expect(button.tabIndex).toBeGreaterThanOrEqual(0)
    })

    it('disabled buttons are not in tab order', () => {
      const { container } = render(<Button disabled>Not Focusable</Button>)
      const button = container.querySelector('button')
      
      expect(button).toHaveAttribute('disabled')
    })
  })

  describe('Screen Reader Support', () => {
    it('provides meaningful button text', () => {
      const { container } = render(<Button>Submit Form</Button>)
      const button = container.querySelector('button')
      
      expect(button.textContent).toBe('Submit Form')
    })

    it('provides aria-label when text is not sufficient', () => {
      const { container } = render(<Button ariaLabel="Close dialog">×</Button>)
      const button = container.querySelector('button')
      
      expect(button).toHaveAttribute('aria-label', 'Close dialog')
    })

    it('announces loading state with aria-busy', () => {
      const { container } = render(<Button loading>Loading</Button>)
      const button = container.querySelector('button')
      
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('hides decorative icons from screen readers', () => {
      const { container } = render(<StatusIndicator status="active" />)
      const icon = container.querySelector('[aria-hidden="true"]')
      
      expect(icon).not.toBeNull()
    })
  })

  describe('Color Independence', () => {
    it('status indicators include both icon and text', () => {
      const { container } = render(<StatusIndicator status="active" />)
      
      // Should have both icon (aria-hidden) and visible text
      const icon = container.querySelector('[aria-hidden="true"]')
      const textContent = container.textContent
      
      expect(icon).not.toBeNull()
      expect(textContent).toContain('Active')
    })

    it('never relies on color alone for status', () => {
      const statuses = ['active', 'pending', 'failed']

      statuses.forEach(status => {
        const { container, unmount } = render(<StatusIndicator status={status} />)

        // Each status should have an icon
        const icon = container.querySelector('[aria-hidden="true"]')
        expect(icon).not.toBeNull()
        expect(icon.textContent).not.toBe('')

        unmount()
      })
    })
  })
})

/**
 * T044 — Open-challenge modal accessibility (WCAG 2.1 AA).
 *
 * Feature 024 introduces the OpenChallengeModal (Maker/Taker tabs). The take flow asks
 * users to enter a four-word claim code and acknowledge a residual brute-force risk;
 * those surfaces must be screen-reader accessible and must not rely on color alone.
 */
describe('OpenChallengeModal Accessibility (feature 024, WCAG 2.1 AA)', () => {
  beforeEach(() => { createOpenChallenge.mockReset(); discover.mockReset(); accept.mockReset() })

  it('has no axe violations on the create modal', async () => {
    const { container } = render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with an info bubble open (spec 039 FR-007)', async () => {
    const { container } = render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // The "How is it resolved?" InfoTip was removed (spec 054); use a surviving
    // field explainer to exercise the info-bubble-open a11y state.
    fireEvent.click(screen.getByRole('button', { name: "About: What's the wager?" }))
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('info icons are keyboard operable: focus, Enter opens, Escape closes and restores focus (spec 039 FR-007)', async () => {
    const user = userEvent.setup()
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // The stake caption + its InfoTip were removed to conserve space (spec 052); use a
    // surviving field explainer to exercise keyboard operability of the info icons.
    const icon = screen.getByRole('button', { name: "About: What's the wager?" })
    icon.focus()
    expect(icon).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('note')).toHaveTextContent(/the taker takes the opposite/i)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(icon).toHaveFocus()
  })

  it('the residual-risk / save-your-code notice is conveyed as TEXT, not color alone', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // The open-challenge explainer moved behind an info icon (spec 039) to cut
    // text density, but it is still conveyed as TEXT (not color-only signaling):
    // reachable on demand from the subtitle's info button.
    fireEvent.click(screen.getByRole('button', { name: 'About open challenges' }))
    expect(
      screen.getByText(/anyone you share the code with can take the other side/i)
    ).toBeInTheDocument()
  })

  it('the modal exposes a dialog role and an accessible name', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // aria-labelledby points at the visible title, giving the dialog an accessible name.
    expect(dialog).toHaveAttribute('aria-labelledby', 'open-challenge-title')
    expect(screen.getByText('Open Challenge')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Spec 041 — oracle open challenge surfaces (WCAG 2.1 AA, Constitution V).
// vi.mock calls are hoisted, so these stubs coexist with the sections above.
// ---------------------------------------------------------------------------
vi.mock('../components/fairwins/PolymarketBrowser', () => ({
  default: ({ onSelectMarket }) => (
    <div>
      <button
        type="button"
        onClick={() => onSelectMarket({
          id: 'm1',
          slug: 'will-eth-flip-btc',
          question: 'Will ETH flip BTC?',
          conditionId: '0xc0ffee',
          endDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
          active: true,
          closed: false,
          outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
        })}
      >
        pick market
      </button>
    </div>
  ),
}))
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => ({ capabilities: { polymarketSidebets: true }, stable: 'USDC', stableDecimals: 6 }),
}))
vi.mock('../hooks/usePolymarketMarket', () => ({
  usePolymarketMarket: () => ({
    market: {
      id: 'm1',
      slug: 'will-eth-flip-btc',
      question: 'Will ETH flip BTC?',
      conditionId: '0xc0ffee',
      endDate: '2026-12-31T00:00:00Z',
      active: true,
      closed: false,
      outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
    },
    isLoading: false,
    error: null,
    refresh: () => {},
  }),
}))

import { OPEN_RESOLUTION_TYPES } from '../hooks/useOpenChallengeCreate'
import TakeChallengePanel from '../components/fairwins/TakeChallengePanel'

// Oracle settlement is consolidated into the Open Challenge modal (spec 052/053) as a
// network-gated resolution path; preselecting it opens the market-search step.
describe('Oracle open challenge accessibility (spec 041 → consolidated)', () => {
  it('has no axe violations on the market-picker step', async () => {
    const { container } = render(
      <OpenChallengeModal isOpen initialResolutionType={OPEN_RESOLUTION_TYPES.Polymarket} onClose={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations on the configure step (side picker + stake + derived timeline)', async () => {
    render(
      <OpenChallengeModal isOpen initialResolutionType={OPEN_RESOLUTION_TYPES.Polymarket} onClose={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /pick market/i }))
    fireEvent.click(screen.getByRole('button', { name: /taking yes/i }))
    const results = await axe(document.body)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations on the claimant oracle bet summary', async () => {
    const { container } = render(
      <TakeChallengePanel
        code="river tiger kite zoo"
        match={{
          wagerId: 1n,
          wager: {
            resolutionType: 4n,
            polymarketConditionId: '0xc0ffee',
            creatorIsYes: true,
            creatorStake: 10_000_000n,
            opponentStake: 10_000_000n,
            acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
            resolveDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
          },
          terms: {
            description: 'Will ETH flip BTC? — creator takes Yes · settled automatically by Polymarket',
            oracle: {
              source: 'polymarket',
              conditionId: '0xc0ffee',
              question: 'Will ETH flip BTC?',
              outcomes: ['Yes', 'No'],
              creatorSide: 0,
              slug: 'will-eth-flip-btc',
            },
          },
          termsUnavailable: false,
          needsMembership: false,
        }}
        onClose={() => {}}
      />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
