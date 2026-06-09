import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ShareWagerModal from '../components/fairwins/ShareWagerModal'

// Spec 009 US2 — the Share Wager modal must render the same scannable,
// broken-image-proof QR (contracts/qr-ui-contract.md, G6–G8).
describe('ShareWagerModal', () => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    url: 'https://fairwins.app/friend-market/accept?marketId=abc123',
    description: 'Patriots win the Super Bowl',
  }

  it('does not render when closed', () => {
    const { container } = render(<ShareWagerModal {...props} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a scannable QR with no embedded image (FR-002 / FR-004)', () => {
    const { container } = render(<ShareWagerModal {...props} />)
    expect(screen.getByLabelText('QR code to share this wager')).toBeInTheDocument()
    expect(container.querySelector('image')).toBeNull()
  })

  it('shows the share link that the QR encodes (FR-005)', () => {
    render(<ShareWagerModal {...props} />)
    expect(screen.getByDisplayValue(props.url)).toBeInTheDocument()
  })
})
