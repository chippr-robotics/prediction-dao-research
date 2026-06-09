import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import WagerQRCode from '../components/ui/WagerQRCode'

// Spec 009 — shared QR renderer contract (contracts/qr-ui-contract.md, G1–G5).
describe('WagerQRCode', () => {
  const URL = 'https://fairwins.app/market/0xabc123'

  it('renders an accessible QR svg for a non-empty value (G1)', () => {
    const { getByLabelText, container } = render(
      <WagerQRCode value={URL} ariaLabel="QR code to share this wager" />
    )
    const svg = getByLabelText('QR code to share this wager')
    expect(svg).toBeInTheDocument()
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders dark modules on a solid white background (G3)', () => {
    const { container } = render(<WagerQRCode value={URL} />)
    const html = container.querySelector('svg').outerHTML
    // White background + dark (near-black) foreground — theme-independent, scannable.
    expect(html.toUpperCase()).toContain('#FFFFFF')
    expect(html.toUpperCase()).toContain('#0E141B')
    // Must NOT use a transparent background (the old, unscannable behavior).
    expect(html.toLowerCase()).not.toContain('transparent')
  })

  it('embeds NO center image — survives a missing logo by construction (G4 / FR-004)', () => {
    const { container } = render(<WagerQRCode value={URL} />)
    expect(container.querySelector('image')).toBeNull()
  })

  it('renders nothing when value is empty (G5 / FR-008)', () => {
    const { container } = render(<WagerQRCode value="" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('encodes the exact value passed (G2)', () => {
    // qrcode.react renders deterministically; assert the component forwards the
    // value by rendering two different URLs and confirming the module paths differ.
    const a = render(<WagerQRCode value="https://fairwins.app/market/1" />)
    const b = render(<WagerQRCode value="https://fairwins.app/market/2" />)
    const pathA = a.container.querySelector('svg path:last-of-type')?.getAttribute('d')
    const pathB = b.container.querySelector('svg path:last-of-type')?.getAttribute('d')
    expect(pathA).toBeTruthy()
    expect(pathA).not.toEqual(pathB)
  })
})
