import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportCallsignButton from '../components/callsigns/ReportCallsignButton'

describe('ReportCallsignButton (spec 054, FR-025)', () => {
  it('renders a mailto to the operator with the callsign, address, and chain pre-filled', () => {
    render(<ReportCallsignButton callsign="chipprbots" address="0xabc0000000000000000000000000000000000def" chainId={137} />)
    const link = screen.getByRole('link', { name: /report/i })
    const href = decodeURIComponent(link.getAttribute('href'))
    expect(href).toMatch(/^mailto:Howdy@FairWins\.App\?/)
    expect(href).toContain('%chipprbots')
    expect(href).toContain('0xabc0000000000000000000000000000000000def')
    expect(href).toContain('137')
  })

  it('renders nothing without a callsign', () => {
    const { container } = render(<ReportCallsignButton callsign="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
