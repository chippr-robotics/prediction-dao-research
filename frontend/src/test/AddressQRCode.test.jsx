import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { QRCodeSVG } from 'qrcode.react'
import AddressQRCode from '../components/ui/AddressQRCode'
import { QR_COLOR_PALETTE } from '../utils/qrColorPreference'

// Spec 011 — address QR renderer contract (contracts/address-qr-ui-contract.md,
// C1–C6 and A1). Uses the REAL qrcode.react renderer throughout: the encoding
// and color assertions are only meaningful against real output.

// EIP-55 example address (mixed-case checksum from the EIP itself) — the
// component must pass it through verbatim, casing intact (research D5).
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

function svgOf(container) {
  return container.querySelector('svg')
}

function modulesPath(container) {
  // qrcode.react renders the background as the first path and the dark
  // modules as the last path; the `d` attribute is a deterministic encoding
  // fingerprint for a given (value, level, margin).
  return svgOf(container).querySelector('path:last-of-type')?.getAttribute('d')
}

describe('AddressQRCode', () => {
  it('renders exactly one svg for a non-empty value (C1)', () => {
    const { container } = render(<AddressQRCode value={ADDRESS} />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it('encodes the value verbatim with the contract parameters (C2 + C5)', () => {
    // Reference render: the raw library called with EXACTLY the contract
    // props (level="H", marginSize={2}, palette default colors). If
    // AddressQRCode forwards anything else — a different level, margin, or a
    // transformed value — the module paths diverge and this fails.
    const reference = render(
      <QRCodeSVG
        value={ADDRESS}
        size={240}
        level="H"
        marginSize={2}
        fgColor="#0E141B"
        bgColor="#FFFFFF"
      />
    )
    const { container } = render(<AddressQRCode value={ADDRESS} />)
    expect(modulesPath(container)).toBeTruthy()
    expect(modulesPath(container)).toEqual(modulesPath(reference.container))

    // Different value → different modules (the value really drives the code).
    const other = render(
      <AddressQRCode value="0x0000000000000000000000000000000000000001" />
    )
    expect(modulesPath(other.container)).not.toEqual(modulesPath(container))
  })

  it('lowercasing the address would change the QR — casing is preserved (C2/D5)', () => {
    const checksummed = render(<AddressQRCode value={ADDRESS} />)
    const lowercased = render(<AddressQRCode value={ADDRESS.toLowerCase()} />)
    expect(modulesPath(checksummed.container)).not.toEqual(
      modulesPath(lowercased.container)
    )
  })

  it('renders the palette foreground on a #FFFFFF background for every palette id (C3)', () => {
    for (const entry of QR_COLOR_PALETTE) {
      const { container, unmount } = render(
        <AddressQRCode value={ADDRESS} paletteId={entry.id} />
      )
      const html = svgOf(container).outerHTML.toUpperCase()
      expect(html).toContain(entry.fg.toUpperCase())
      expect(html).toContain('#FFFFFF')
      expect(html.toLowerCase()).not.toContain('transparent')
      unmount()
    }
  })

  it('falls back to the midnight palette for unknown palette ids (C3)', () => {
    const { container } = render(
      <AddressQRCode value={ADDRESS} paletteId="hot-pink" />
    )
    const html = svgOf(container).outerHTML.toUpperCase()
    expect(html).toContain('#0E141B')
    expect(html).toContain('#FFFFFF')
  })

  it('never embeds an image element, for any palette id (C4)', () => {
    for (const entry of QR_COLOR_PALETTE) {
      const { container, unmount } = render(
        <AddressQRCode value={ADDRESS} paletteId={entry.id} />
      )
      expect(container.querySelector('image')).toBeNull()
      unmount()
    }
  })

  it('renders nothing for an empty value (C6)', () => {
    const empty = render(<AddressQRCode value="" />)
    expect(empty.container.querySelector('svg')).toBeNull()
    const missing = render(<AddressQRCode />)
    expect(missing.container.querySelector('svg')).toBeNull()
  })

  it('exposes role="img" with an accessible name containing the shortened address (A1)', () => {
    const { container } = render(<AddressQRCode value={ADDRESS} />)
    const svg = svgOf(container)
    expect(svg.getAttribute('role')).toBe('img')
    const label = svg.getAttribute('aria-label')
    expect(label).toContain('0x5aAe')
    expect(label).toContain('eAed')
    expect(label.toLowerCase()).toContain('qr code')
  })

  it('honors an explicit ariaLabel override (A1)', () => {
    const { getByLabelText } = render(
      <AddressQRCode value={ADDRESS} ariaLabel="My address QR" />
    )
    expect(getByLabelText('My address QR')).toBeTruthy()
  })
})
