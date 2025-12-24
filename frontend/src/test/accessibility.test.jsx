import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import Button from '../components/ui/Button'
import StatusIndicator from '../components/ui/StatusIndicator'

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
