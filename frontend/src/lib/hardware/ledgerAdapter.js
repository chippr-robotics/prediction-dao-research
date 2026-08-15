// Spec 085 — Ledger adapter. Talks to the device over WebHID (preferred) or WebUSB via the official
// @ledgerhq transports and the Ethereum app protocol (@ledgerhq/hw-app-eth). Loaded only through
// `connectHardware('ledger')` — never import this module directly from UI code.
//
// The device exposes public keys/addresses per derivation path and signs on-device; no secret can
// reach this code. Status words from the Ethereum app are normalized into typed errors so the UI
// can say "unlock the device" / "open the Ethereum app" instead of "0x6511".

import { HardwareWalletError, HW_ERROR_CODES } from './errors'
import { detectTransports } from './adapters'

// hw-app-eth expects paths without the leading "m/".
const appPath = (path) => String(path).replace(/^m\//, '')

const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** Map a raw transport/app error onto the typed vocabulary. Exported for tests. */
export function classifyLedgerError(err) {
  const name = err?.name || ''
  const status = err?.statusCode
  if (name === 'TransportOpenUserCancelled') return HW_ERROR_CODES.PERMISSION_DENIED
  if (name === 'TransportInterfaceNotAvailable' || name === 'TransportWebUSBGestureRequired') {
    return HW_ERROR_CODES.PERMISSION_DENIED
  }
  if (name === 'DisconnectedDevice' || name === 'DisconnectedDeviceDuringOperation') {
    return HW_ERROR_CODES.DISCONNECTED
  }
  if (status === 0x5515 || status === 0x6982 || status === 0x6b0c) return HW_ERROR_CODES.DEVICE_LOCKED
  if (status === 0x6511 || status === 0x6e00 || status === 0x6d00 || status === 0x6e01) {
    return HW_ERROR_CODES.WRONG_APP
  }
  if (status === 0x6985 || status === 0x5501) return HW_ERROR_CODES.USER_CANCELLED
  return HW_ERROR_CODES.UNKNOWN
}

const wrap = (err) =>
  err instanceof HardwareWalletError
    ? err
    : new HardwareWalletError(classifyLedgerError(err), undefined, { cause: err, vendor: 'ledger' })

async function openTransport() {
  const transports = detectTransports()
  try {
    if (transports.webhid) {
      const { default: TransportWebHID } = await import('@ledgerhq/hw-transport-webhid')
      return await TransportWebHID.create()
    }
    if (transports.webusb) {
      const { default: TransportWebUSB } = await import('@ledgerhq/hw-transport-webusb')
      return await TransportWebUSB.create()
    }
  } catch (err) {
    throw wrap(err)
  }
  throw new HardwareWalletError(HW_ERROR_CODES.TRANSPORT_UNSUPPORTED, undefined, { vendor: 'ledger' })
}

export async function connectLedger() {
  const transport = await openTransport()
  const { default: Eth } = await import('@ledgerhq/hw-app-eth')
  const eth = new Eth(transport)

  // Probe once so "locked" / "wrong app" surface at connect time, in the step whose UI explains
  // them, rather than mid-way through the account list.
  try {
    await eth.getAddress(appPath("m/44'/60'/0'/0/0"), false)
  } catch (err) {
    await transport.close().catch(() => {})
    throw wrap(err)
  }

  return {
    vendor: 'ledger',

    async getAddress(path, { display = false } = {}) {
      try {
        const res = await eth.getAddress(appPath(path), display)
        return { address: res.address }
      } catch (err) {
        throw wrap(err)
      }
    },

    async getAddresses(paths) {
      // The Ethereum app answers one APDU at a time — sequential by protocol, not by choice.
      const out = []
      for (const path of paths) {
        const { address } = await this.getAddress(path)
        out.push({ path, address })
      }
      return out
    },

    async signPersonalMessage(path, messageBytes) {
      try {
        const hex = bytesToHex(messageBytes)
        const { r, s, v } = await eth.signPersonalMessage(appPath(path), hex)
        return `0x${r}${s}${Number(v).toString(16).padStart(2, '0')}`
      } catch (err) {
        throw wrap(err)
      }
    },

    async signTransaction(path, unsignedSerialized) {
      try {
        const raw = String(unsignedSerialized).replace(/^0x/, '')
        // `null` resolution: skip Ledger's remote clear-signing metadata service — no external
        // call from the app; the device falls back to on-screen review of the raw fields.
        const { r, s, v } = await eth.signTransaction(appPath(path), raw, null)
        return { r: `0x${r}`, s: `0x${s}`, v: `0x${v}` }
      } catch (err) {
        throw wrap(err)
      }
    },

    /**
     * EIP-712. The Ethereum app signs from the two 32-byte hashes (domain separator +
     * hashStruct(message)), which every firmware supports; the caller (HardwareSigner)
     * computes them with ethers' TypedDataEncoder.
     */
    async signTypedData(path, { domainSeparator, hashStructMessage }) {
      try {
        const { r, s, v } = await eth.signEIP712HashedMessage(
          appPath(path),
          String(domainSeparator).replace(/^0x/, ''),
          String(hashStructMessage).replace(/^0x/, ''),
        )
        return `0x${r}${s}${Number(v).toString(16).padStart(2, '0')}`
      } catch (err) {
        throw wrap(err)
      }
    },

    async close() {
      await transport.close().catch(() => {})
    },
  }
}
