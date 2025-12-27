import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BlockiesAvatar from '../components/ui/BlockiesAvatar'

describe('BlockiesAvatar', () => {
  const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'

  it('renders with a valid address', () => {
    render(<BlockiesAvatar address={mockAddress} />)
    
    const img = screen.getByRole('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src')
    expect(img.src).toMatch(/^data:image\/png/)
  })

  it('renders fallback when no address is provided', () => {
    render(<BlockiesAvatar />)
    
    const fallback = screen.getByRole('img', { name: /default wallet avatar/i })
    expect(fallback).toBeInTheDocument()
    expect(fallback).toHaveTextContent('👛')
  })

  it('applies custom size', () => {
    render(<BlockiesAvatar address={mockAddress} size={64} />)
    
    const img = screen.getByRole('img')
    expect(img).toHaveStyle({ width: '64px', height: '64px' })
  })

  it('applies custom className', () => {
    render(<BlockiesAvatar address={mockAddress} className="custom-class" />)
    
    const img = screen.getByRole('img')
    expect(img).toHaveClass('blockies-avatar')
    expect(img).toHaveClass('custom-class')
  })

  it('uses custom alt text when provided', () => {
    const customAlt = 'Custom avatar description'
    render(<BlockiesAvatar address={mockAddress} alt={customAlt} />)
    
    const img = screen.getByAltText(customAlt)
    expect(img).toBeInTheDocument()
  })

  it('generates deterministic image for same address', () => {
    const { rerender } = render(<BlockiesAvatar address={mockAddress} />)
    const firstImg = screen.getByRole('img')
    const firstSrc = firstImg.src

    // Re-render with same address
    rerender(<BlockiesAvatar address={mockAddress} />)
    const secondImg = screen.getByRole('img')
    
    // Should generate the same image
    expect(secondImg.src).toBe(firstSrc)
  })

  it('generates different images for different addresses', () => {
    const address1 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'
    const address2 = '0x1234567890123456789012345678901234567890'

    const { rerender } = render(<BlockiesAvatar address={address1} />)
    const firstImg = screen.getByRole('img')
    const firstSrc = firstImg.src

    // Re-render with different address
    rerender(<BlockiesAvatar address={address2} />)
    const secondImg = screen.getByRole('img')
    
    // Should generate different images
    expect(secondImg.src).not.toBe(firstSrc)
  })

  it('has proper accessibility attributes', () => {
    render(<BlockiesAvatar address={mockAddress} />)
    
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('alt')
    expect(img.alt).toContain('0x742d')
  })
})
