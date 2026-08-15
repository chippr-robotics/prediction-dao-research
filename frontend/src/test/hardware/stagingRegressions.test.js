// Spec 085 follow-up — regression coverage for the two staging connect failures. Both bugs lived
// in the gap between dev (test-adapter seam) and a real browser executing the built vendor SDKs:
//
//   1. The SDKs call the Node `Buffer` global bare; browsers have none → ReferenceError on the
//      first device exchange. Fix: ensureNodeGlobals(), installed by connectHardware BEFORE any
//      vendor module loads.
//   2. @trezor/connect-web's bundler interop double-wraps the instance (`mod.default.default`
//      in the production bundle) → `init is not a function`. Fix: resolve by capability.
//
// The full built-bundle proof lives in scripts/ui/verify-hardware-bundle.mjs (operator-run);
// these unit tests pin the two seams so a refactor cannot quietly reopen them.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = []

vi.mock('../../lib/hardware/nodeShims', () => ({
  ensureNodeGlobals: vi.fn(async () => {
    calls.push('shims')
  }),
}))
vi.mock('../../lib/hardware/ledgerAdapter', () => ({
  connectLedger: vi.fn(async () => {
    calls.push('ledger')
    return { vendor: 'ledger', close: async () => {} }
  }),
}))

// Double-default interop shape — what the production bundle actually hands us (staging bug 2).
const trezorApi = {
  init: vi.fn(async () => {
    calls.push('trezor-init')
  }),
  ethereumGetAddress: vi.fn(async () => ({ success: true, payload: { address: '0x1' } })),
  ethereumSignMessage: vi.fn(),
  ethereumSignTransaction: vi.fn(),
  ethereumSignTypedData: vi.fn(),
}
vi.mock('@trezor/connect-web', () => ({ default: { default: trezorApi } }))
vi.mock('../../config/tenant', () => ({
  tenantBrand: () => ({ appUrl: 'https://fairwins.app' }),
  tenantLinks: () => ({ support: { email: 'support@example.com' } }),
}))

import { connectHardware } from '../../lib/hardware/adapters'
import { ensureNodeGlobals } from '../../lib/hardware/nodeShims'
import { connectLedger } from '../../lib/hardware/ledgerAdapter'
import { connectTrezor, classifyTrezorError } from '../../lib/hardware/trezorAdapter'
import { HW_ERROR_CODES, describeHardwareError, reportHardwareError, HardwareWalletError } from '../../lib/hardware/errors'

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
})

describe('staging regressions (spec 085 follow-up)', () => {
  it('installs the Node-globals shim BEFORE any vendor SDK code loads (bug 1)', async () => {
    // jsdom offers no WebHID; the availability gate is not what this test is about.
    Object.defineProperty(navigator, 'hid', { value: {}, configurable: true })
    await connectHardware('ledger')
    delete navigator.hid
    expect(ensureNodeGlobals).toHaveBeenCalledTimes(1)
    expect(connectLedger).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['shims', 'ledger'])
  })

  it('resolves Trezor Connect by capability, surviving double-default interop (bug 2)', async () => {
    const session = await connectTrezor()
    expect(trezorApi.init).toHaveBeenCalledTimes(1)
    const { address } = await session.getAddress("m/44'/60'/0'/0/0")
    expect(address).toBe('0x1')
  })

  it('classifies a popup handshake failure as popup-blocked, with a stated remedy', () => {
    expect(classifyTrezorError({ error: 'handshake failed' })).toBe(HW_ERROR_CODES.POPUP_BLOCKED)
    expect(describeHardwareError(new HardwareWalletError(HW_ERROR_CODES.POPUP_BLOCKED))).toMatch(/allow popups/i)
  })

  it('reportHardwareError logs the raw failure for operators and returns the member sentence', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const raw = new Error('ReferenceError: Buffer is not defined')
    const sentence = reportHardwareError(raw, 'hardware-add')
    expect(sentence).toMatch(/went wrong talking to the device/i)
    expect(warn).toHaveBeenCalledWith('[hardware-add]', raw, '')
    warn.mockRestore()
  })
})
