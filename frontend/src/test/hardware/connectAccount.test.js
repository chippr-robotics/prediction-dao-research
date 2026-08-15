/**
 * connectHardwareAccount (spec 086, FR-008). Reconnecting a saved account must
 * verify the device re-derives the saved address — a different device (or
 * passphrase) yields a different account, and the session is closed rather
 * than handed out as a signer for the wrong one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectHardwareAccount } from '../../lib/hardware/connectAccount'
import { HardwareSigner } from '../../lib/hardware/hardwareSigner'
import { HardwareWalletError, HW_ERROR_CODES } from '../../lib/hardware/errors'
import { connectHardware } from '../../lib/hardware/adapters'

vi.mock('../../lib/hardware/adapters', () => ({
  connectHardware: vi.fn(),
}))

const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const PATH = "m/44'/60'/0'/0/0"
const entry = { address: ADDR, vendor: 'ledger', path: PATH }

function fakeSession(derivedAddress) {
  return {
    vendor: 'ledger',
    getAddress: vi.fn(async () => ({ address: derivedAddress })),
    signPersonalMessage: vi.fn(),
    signTransaction: vi.fn(),
    close: vi.fn(async () => {}),
  }
}

// Braces matter: a hook returning the mock (mockReset returns `this`) would make
// vitest invoke the mock itself as a teardown callback.
beforeEach(() => {
  vi.mocked(connectHardware).mockReset()
})

describe('connectHardwareAccount', () => {
  it('returns a HardwareSigner for the saved account when the device derives the same address', async () => {
    const session = fakeSession(ADDR.toLowerCase()) // devices often report lowercase
    vi.mocked(connectHardware).mockResolvedValue(session)

    const signer = await connectHardwareAccount({ entry })
    expect(signer).toBeInstanceOf(HardwareSigner)
    await expect(signer.getAddress()).resolves.toBe(ADDR)
    expect(signer.path).toBe(PATH)
    expect(connectHardware).toHaveBeenCalledWith('ledger')
    expect(session.getAddress).toHaveBeenCalledWith(PATH)
    expect(session.close).not.toHaveBeenCalled()
  })

  it('refuses a device that derives a different address, and closes the session', async () => {
    const session = fakeSession(OTHER)
    vi.mocked(connectHardware).mockResolvedValue(session)

    const err = await connectHardwareAccount({ entry }).catch((e) => e)
    expect(err).toBeInstanceOf(HardwareWalletError)
    expect(err.message).toMatch(/different address/)
    expect(session.close).toHaveBeenCalledTimes(1)
  })

  it('propagates an adapter failure without producing a signer', async () => {
    vi.mocked(connectHardware).mockRejectedValue(
      new HardwareWalletError(HW_ERROR_CODES.DEVICE_LOCKED),
    )
    const err = await connectHardwareAccount({ entry }).catch((e) => e)
    expect(err).toBeInstanceOf(HardwareWalletError)
    expect(err.code).toBe(HW_ERROR_CODES.DEVICE_LOCKED)
  })

  it('closes the session when deriving the address itself fails', async () => {
    const session = fakeSession(ADDR)
    session.getAddress.mockRejectedValue(new HardwareWalletError(HW_ERROR_CODES.WRONG_APP))
    vi.mocked(connectHardware).mockResolvedValue(session)

    const err = await connectHardwareAccount({ entry }).catch((e) => e)
    expect(err.code).toBe(HW_ERROR_CODES.WRONG_APP)
    expect(session.close).toHaveBeenCalledTimes(1)
  })

  it('rejects an incomplete saved entry without opening a session', async () => {
    await expect(connectHardwareAccount({ entry: { address: ADDR, vendor: 'ledger' } })).rejects.toThrow(
      /incomplete/,
    )
    expect(connectHardware).not.toHaveBeenCalled()
  })
})
