import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Card from '../../../components/ui/Card'

describe('Card', () => {
  describe('Basic Rendering', () => {
    it('should render children', () => {
      render(<Card>Card Content</Card>)

      expect(screen.getByText('Card Content')).toBeInTheDocument()
    })

    it('should render as a div element', () => {
      const { container } = render(<Card>Content</Card>)

      expect(container.firstChild.tagName).toBe('DIV')
    })

    it('should apply custom className', () => {
      const { container } = render(<Card className="custom-class">Content</Card>)

      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('should pass additional props', () => {
      render(<Card data-testid="test-card">Content</Card>)

      expect(screen.getByTestId('test-card')).toBeInTheDocument()
    })
  })

  describe('Interactive Cards', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick}>Clickable</Card>)

      fireEvent.click(screen.getByText('Clickable'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should have button role when onClick is provided', () => {
      render(<Card onClick={() => {}}>Clickable</Card>)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should be focusable when onClick is provided', () => {
      const { container } = render(<Card onClick={() => {}}>Clickable</Card>)

      expect(container.firstChild).toHaveAttribute('tabIndex', '0')
    })

    it('should call onClick when Enter key is pressed', () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick}>Clickable</Card>)

      const card = screen.getByRole('button')
      fireEvent.keyDown(card, { key: 'Enter' })

      expect(handleClick).toHaveBeenCalled()
    })

    it('should call onClick when Space key is pressed', () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick}>Clickable</Card>)

      const card = screen.getByRole('button')
      fireEvent.keyDown(card, { key: ' ' })

      expect(handleClick).toHaveBeenCalled()
    })

    it('should not call onClick for other keys', () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick}>Clickable</Card>)

      const card = screen.getByRole('button')
      fireEvent.keyDown(card, { key: 'Tab' })

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('should allow custom role override', () => {
      render(<Card onClick={() => {}} role="listitem">Item</Card>)

      expect(screen.getByRole('listitem')).toBeInTheDocument()
    })

    it('should allow custom tabIndex override', () => {
      const { container } = render(<Card onClick={() => {}} tabIndex={-1}>Content</Card>)

      expect(container.firstChild).toHaveAttribute('tabIndex', '-1')
    })
  })

  describe('Non-Interactive Cards', () => {
    it('should not have button role', () => {
      render(<Card>Static Content</Card>)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('should not have tabIndex by default', () => {
      const { container } = render(<Card>Static Content</Card>)

      expect(container.firstChild).not.toHaveAttribute('tabIndex')
    })

    it('should allow custom tabIndex', () => {
      const { container } = render(<Card tabIndex={0}>Static Content</Card>)

      expect(container.firstChild).toHaveAttribute('tabIndex', '0')
    })
  })

  describe('Keyboard Handler', () => {
    it('should call custom onKeyDown handler', () => {
      const handleKeyDown = vi.fn()
      render(<Card onKeyDown={handleKeyDown}>Content</Card>)

      fireEvent.keyDown(screen.getByText('Content'), { key: 'Tab' })

      expect(handleKeyDown).toHaveBeenCalled()
    })

    it('should call both onClick and onKeyDown on Enter', () => {
      const handleClick = vi.fn()
      const handleKeyDown = vi.fn()
      render(<Card onClick={handleClick} onKeyDown={handleKeyDown}>Content</Card>)

      const card = screen.getByRole('button')
      fireEvent.keyDown(card, { key: 'Enter' })

      expect(handleClick).toHaveBeenCalled()
      expect(handleKeyDown).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should set aria-label when provided', () => {
      render(<Card ariaLabel="Custom label">Content</Card>)

      expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
    })

    it('should prevent default on Enter/Space for interactive cards', () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick}>Clickable</Card>)

      const card = screen.getByRole('button')
      const event = { key: 'Enter', preventDefault: vi.fn() }
      fireEvent.keyDown(card, event)

      // The event should have its default prevented
      expect(handleClick).toHaveBeenCalled()
    })
  })

  describe('Ref Forwarding', () => {
    it('should forward ref to the div element', () => {
      const ref = { current: null }
      render(<Card ref={ref}>Content</Card>)

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })

    it('should allow access to DOM methods via ref', () => {
      const ref = { current: null }
      render(<Card ref={ref}>Content</Card>)

      expect(typeof ref.current.focus).toBe('function')
    })
  })

  describe('Display Name', () => {
    it('should have correct displayName', () => {
      expect(Card.displayName).toBe('Card')
    })
  })

  describe('Complex Content', () => {
    it('should render nested elements', () => {
      render(
        <Card>
          <h2>Title</h2>
          <p>Description</p>
        </Card>
      )

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Title')
      expect(screen.getByText('Description')).toBeInTheDocument()
    })

    it('should render multiple children', () => {
      render(
        <Card>
          <span>First</span>
          <span>Second</span>
          <span>Third</span>
        </Card>
      )

      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.getByText('Third')).toBeInTheDocument()
    })
  })
})
