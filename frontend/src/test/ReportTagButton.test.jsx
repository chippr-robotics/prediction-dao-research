import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportTagButton from '../components/tags/ReportTagButton'

describe('ReportTagButton (spec 054, FR-025)', () => {
  it('renders a mailto to the operator with the tag, address, and chain pre-filled', () => {
    render(<ReportTagButton tag="chipprbots" address="0xabc0000000000000000000000000000000000def" chainId={137} />)
    const link = screen.getByRole('link', { name: /report/i })
    const href = decodeURIComponent(link.getAttribute('href'))
    expect(href).toMatch(/^mailto:Howdy@FairWins\.App\?/)
    expect(href).toContain('%chipprbots')
    expect(href).toContain('0xabc0000000000000000000000000000000000def')
    expect(href).toContain('137')
  })

  it('renders nothing without a tag', () => {
    const { container } = render(<ReportTagButton tag="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
