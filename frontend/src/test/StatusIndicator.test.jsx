import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import StatusIndicator from '../components/ui/StatusIndicator'

describe('StatusIndicator Component', () => {
  describe('Rendering', () => {
    it('renders status with icon and label', () => {
      render(<StatusIndicator status="active" />)
      expect(screen.getByText(/active/i)).toBeInTheDocument()
    })

    it('renders all status types correctly', () => {
      const statuses = ['active', 'pending', 'reviewing', 'cancelled', 'executed', 'forfeited', 'completed', 'failed']
      
      statuses.forEach(status => {
        const { unmount } = render(<StatusIndicator status={status} />)
        const element = screen.getByText(new RegExp(status, 'i'))
        expect(element).toBeInTheDocument()
        unmount()
      })
    })

    it('falls back to pending status for unknown status', () => {
      render(<StatusIndicator status="unknown-status" />)
      expect(screen.getByText(/pending/i)).toBeInTheDocument()
    })
  })

  describe('Customization', () => {
    it('allows custom icon override', () => {
      const { container } = render(<StatusIndicator status="active" customIcon="🎉" />)
      expect(container.textContent).toContain('🎉')
    })

    it('allows custom label override', () => {
      render(<StatusIndicator status="active" customLabel="Custom Status" />)
      expect(screen.getByText(/custom status/i)).toBeInTheDocument()
    })

    it('accepts custom className', () => {
      const { container } = render(<StatusIndicator status="active" className="custom-class" />)
      const statusElement = container.firstChild
      expect(statusElement.className).toContain('custom-class')
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<StatusIndicator status="active" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('hides icon from screen readers', () => {
      const { container } = render(<StatusIndicator status="active" />)
      const icon = container.querySelector('[aria-hidden="true"]')
      expect(icon).toBeInTheDocument()
    })

    it('provides text label for screen readers', () => {
      render(<StatusIndicator status="active" />)
      // The status label should be visible to screen readers
      expect(screen.getByText(/active/i)).toBeVisible()
    })

    it('never relies on color alone', () => {
      // Each status should have both an icon and a text label
      const statuses = ['active', 'pending', 'failed']
      
      statuses.forEach(status => {
        const { container, unmount } = render(<StatusIndicator status={status} />)
        
        // Check that both icon and label exist
        const icon = container.querySelector('[aria-hidden="true"]')
        const label = screen.getByText(new RegExp(status, 'i'))
        
        expect(icon).toBeInTheDocument()
        expect(label).toBeInTheDocument()
        
        unmount()
      })
    })
  })

  describe('Status Mapping', () => {
    it('maps success statuses correctly', () => {
      const successStatuses = ['active', 'executed', 'completed']
      
      successStatuses.forEach(status => {
        const { container, unmount } = render(<StatusIndicator status={status} />)
        const element = container.firstChild
        expect(element.className).toContain('status-success')
        unmount()
      })
    })

    it('maps warning statuses correctly', () => {
      const warningStatuses = ['pending', 'reviewing']
      
      warningStatuses.forEach(status => {
        const { container, unmount } = render(<StatusIndicator status={status} />)
        const element = container.firstChild
        expect(element.className).toContain('status-warning')
        unmount()
      })
    })

    it('maps danger statuses correctly', () => {
      const dangerStatuses = ['cancelled', 'forfeited', 'failed']
      
      dangerStatuses.forEach(status => {
        const { container, unmount } = render(<StatusIndicator status={status} />)
        const element = container.firstChild
        expect(element.className).toContain('status-danger')
        unmount()
      })
    })
  })
})
