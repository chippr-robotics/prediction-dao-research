// Spec 085 — the single seam between the app and hardware-wallet vendors. Everything above this
// module (the add-account sheet, the connect dialog, the signer) talks to one adapter interface;
// everything vendor-specific (Ledger APDU transports, the Trezor Connect popup) lives behind it.
//
// Adapter interface — `connectHardware(vendor)` resolves to a session:
//
//   {
//     vendor: 'ledger' | 'trezor',
//     getAddress(path, { display = false }) → Promise<{ address: string }>,
//     getAddresses(paths)                   → Promise<Array<{ path, address }>>,
//     signPersonalMessage(path, messageBytes) → Promise<`0x…` 65-byte signature>,
//     signTransaction(path, unsignedSerialized, txFields) → Promise<{ r, s, v }>,
//     close() → Promise<void>,
//   }
//
// Vendor SDKs are loaded lazily (dynamic import) so members who never open the flow never download
// them. Failures are normalized to HardwareWalletError before they leave this layer (FR-012).
//
// Test seam: in DEV builds only, a capture harness or e2e run may plant
// `window.__fwHardwareTestAdapter__(vendor)` and the factory uses it instead of real vendor code.
// The guard is `import.meta.env.DEV`, so production bundles contain no test path at all —
// dead-code elimination removes the branch (constitution III: no mocks in shipped paths).

import { HardwareWalletError, HW_ERROR_CODES } from './errors'
import { ensureNodeGlobals } from './nodeShims'

export const VENDOR_LABELS = Object.freeze({ ledger: 'Ledger', trezor: 'Trezor' })

/** Which browser transports exist here. Pure capability read — no permission prompt. */
export function detectTransports(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  return {
    webhid: Boolean(nav && 'hid' in nav),
    webusb: Boolean(nav && 'usb' in nav),
  }
}

/**
 * Whether a vendor's connect flow can run in this browser, with the honest reason when it cannot
 * (FR-003 — a vendor the browser cannot reach renders disabled with the reason, never as a dead
 * control).
 * @returns {{ available: boolean, reason: string|null }}
 */
export function vendorAvailability(vendor, transports = detectTransports()) {
  if (vendor === 'ledger') {
    if (transports.webhid || transports.webusb) return { available: true, reason: null }
    return {
      available: false,
      reason: 'Ledger needs WebHID or WebUSB, which this browser does not offer. Use a Chromium-based browser.',
    }
  }
  if (vendor === 'trezor') {
    // Trezor Connect runs in a vendor popup and needs no local transport, but it does need a window.
    if (typeof window === 'undefined') return { available: false, reason: 'Trezor Connect needs a browser window.' }
    return { available: true, reason: null }
  }
  return { available: false, reason: 'Unknown device vendor.' }
}

/**
 * Open a session with the device. The caller owns the session and MUST `close()` it when the flow
 * ends (the sheet's teardown does), so the transport is released for other tabs/tools.
 */
export async function connectHardware(vendor) {
  if (import.meta.env.DEV && typeof window !== 'undefined' && typeof window.__fwHardwareTestAdapter__ === 'function') {
    return window.__fwHardwareTestAdapter__(vendor)
  }
  const availability = vendorAvailability(vendor)
  if (!availability.available) {
    throw new HardwareWalletError(HW_ERROR_CODES.TRANSPORT_UNSUPPORTED, availability.reason, { vendor })
  }
  // The vendor SDKs assume Node globals (Buffer); install the browser polyfill before any of
  // their code loads. See nodeShims.js for why this exists and why it is lazy.
  await ensureNodeGlobals()
  if (vendor === 'ledger') {
    const { connectLedger } = await import('./ledgerAdapter')
    return connectLedger()
  }
  if (vendor === 'trezor') {
    const { connectTrezor } = await import('./trezorAdapter')
    return connectTrezor()
  }
  throw new HardwareWalletError(HW_ERROR_CODES.UNKNOWN, `Unknown device vendor: ${vendor}`)
}
