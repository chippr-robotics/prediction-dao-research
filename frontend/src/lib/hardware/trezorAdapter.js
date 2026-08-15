// Spec 085 — Trezor adapter. Uses @trezor/connect-web: vendor code runs in a trezor.io popup that
// talks to the device (via Trezor Bridge/WebUSB on the vendor's side) and posts results back.
// Nothing secret crosses the boundary — the popup returns addresses and signatures only. Loaded
// only through `connectHardware('trezor')` — never import this module directly from UI code.
//
// TrezorConnect.init is once-per-page by SDK design; we memoize it and `close()` on a session is a
// no-op (the popup closes itself after each call).

import { HardwareWalletError, HW_ERROR_CODES } from './errors'
import { tenantBrand, tenantLinks } from '../../config/tenant'

let initPromise = null

async function getTrezorConnect() {
  const mod = await import('@trezor/connect-web')
  const TrezorConnect = mod.default || mod
  if (!initPromise) {
    // Vendor-required identification of the integrating app (shown to the member in the Trezor
    // popup). Public values, not credentials — resolved from the tenant manifest (spec 072:
    // never hardcode a tenant identity in a shipped path).
    const brand = tenantBrand()
    const links = tenantLinks()
    initPromise = TrezorConnect.init({
      lazyLoad: true,
      manifest: {
        email: links.support?.email || `support@${new URL(brand.appUrl).hostname}`,
        appUrl: typeof window !== 'undefined' ? window.location.origin : brand.appUrl,
      },
    }).catch((err) => {
      initPromise = null // allow a retry after a failed init (e.g. popup blocked)
      throw err
    })
  }
  await initPromise
  return TrezorConnect
}

/** Map a Trezor Connect failure payload/error onto the typed vocabulary. Exported for tests. */
export function classifyTrezorError(payloadOrError) {
  const text = String(payloadOrError?.error || payloadOrError?.message || payloadOrError || '').toLowerCase()
  const code = String(payloadOrError?.code || '')
  if (code === 'Method_Interrupted' || text.includes('cancelled') || text.includes('canceled')) {
    return HW_ERROR_CODES.USER_CANCELLED
  }
  if (text.includes('popup') || text.includes('permission')) return HW_ERROR_CODES.PERMISSION_DENIED
  if (text.includes('device disconnected') || text.includes('device not found') || text.includes('transport missing')) {
    return HW_ERROR_CODES.DISCONNECTED
  }
  if (text.includes('pin')) return HW_ERROR_CODES.DEVICE_LOCKED
  return HW_ERROR_CODES.UNKNOWN
}

const failure = (payload) =>
  new HardwareWalletError(classifyTrezorError(payload), undefined, { cause: payload, vendor: 'trezor' })

const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export async function connectTrezor() {
  let TrezorConnect
  try {
    TrezorConnect = await getTrezorConnect()
  } catch (err) {
    throw err instanceof HardwareWalletError ? err : failure(err)
  }

  return {
    vendor: 'trezor',

    async getAddress(path, { display = false } = {}) {
      const res = await TrezorConnect.ethereumGetAddress({ path, showOnTrezor: display })
      if (!res.success) throw failure(res.payload)
      return { address: res.payload.address }
    },

    async getAddresses(paths) {
      // One popup round-trip for the whole page of accounts.
      const res = await TrezorConnect.ethereumGetAddress({
        bundle: paths.map((path) => ({ path, showOnTrezor: false })),
      })
      if (!res.success) throw failure(res.payload)
      return res.payload.map((p, i) => ({ path: paths[i], address: p.address }))
    },

    async signPersonalMessage(path, messageBytes) {
      const res = await TrezorConnect.ethereumSignMessage({
        path,
        message: bytesToHex(messageBytes),
        hex: true,
      })
      if (!res.success) throw failure(res.payload)
      const sig = String(res.payload.signature)
      return sig.startsWith('0x') ? sig : `0x${sig}`
    },

    async signTransaction(path, _unsignedSerialized, txFields) {
      // Trezor signs from structured fields, not the serialized form.
      const res = await TrezorConnect.ethereumSignTransaction({ path, transaction: txFields })
      if (!res.success) throw failure(res.payload)
      // Normalize hex prefixes — HardwareSigner feeds these to ethers' Signature.from, which
      // requires 0x-prefixed strings (the Ledger adapter already returns them that way).
      const hex = (x) => (String(x).startsWith('0x') ? String(x) : `0x${x}`)
      const { r, s, v } = res.payload
      return { r: hex(r), s: hex(s), v: hex(v) }
    },

    /** EIP-712. Trezor signs from the full typed-data document (MetaMask v4 semantics). */
    async signTypedData(path, { domain, types, primaryType, message }) {
      const res = await TrezorConnect.ethereumSignTypedData({
        path,
        data: { domain, types, primaryType, message },
        metamask_v4_compat: true,
      })
      if (!res.success) throw failure(res.payload)
      const sig = String(res.payload.signature)
      return sig.startsWith('0x') ? sig : `0x${sig}`
    },

    async close() {
      // Popup lifecycle is per-call; nothing to release.
    },
  }
}
