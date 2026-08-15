/**
 * HardwareSigner (spec 085, FR-008/FR-009). Uses real ethers v6: the mock
 * session signs with a real Wallet's signing key so the recover-and-cross-check
 * guard is exercised for real — a session signing with the wrong account must
 * never serialize a broadcastable transaction.
 */
import { describe, it, expect, vi } from 'vitest'
import { Wallet, Transaction, TypedDataEncoder, getAddress } from 'ethers'
import { HardwareSigner, yParityFrom } from '../../lib/hardware/hardwareSigner'
import { HardwareWalletError } from '../../lib/hardware/errors'

// Well-known hardhat test keys — nothing secret.
const PK_A = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PK_B = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const PATH = "m/44'/60'/0'/0/0"
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

/** A device session that really signs — backed by an ethers Wallet's key. */
function sessionFor(wallet) {
  return {
    vendor: 'ledger',
    signTransaction: vi.fn(async (path, unsignedSerialized) => {
      const tx = Transaction.from(unsignedSerialized)
      const sig = wallet.signingKey.sign(tx.unsignedHash)
      return { r: sig.r, s: sig.s, v: sig.v }
    }),
    signPersonalMessage: vi.fn(),
    signTypedData: vi.fn(),
    close: vi.fn(async () => {}),
  }
}

const txRequest = {
  to: TO,
  value: 1n,
  chainId: 137,
  nonce: 0,
  gasLimit: 21000n,
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
  type: 2,
}

describe('yParityFrom', () => {
  it('passes raw yParity bits through', () => {
    expect(yParityFrom(0)).toBe(0)
    expect(yParityFrom(1)).toBe(1)
  })

  it('normalizes legacy 27/28', () => {
    expect(yParityFrom(27)).toBe(0)
    expect(yParityFrom(28)).toBe(1)
  })

  it('normalizes EIP-155 v values (chainId 1 → 37/38)', () => {
    expect(yParityFrom(37)).toBe(0)
    expect(yParityFrom(38)).toBe(1)
    // Polygon (chainId 137): v = 35 + 2*137 + parity = 309/310
    expect(yParityFrom(309)).toBe(0)
    expect(yParityFrom(310)).toBe(1)
  })

  it('accepts hex strings', () => {
    expect(yParityFrom('0x1b')).toBe(0)
    expect(yParityFrom('0x1c')).toBe(1)
    expect(yParityFrom('0x0')).toBe(0)
    expect(yParityFrom('0x1')).toBe(1)
  })

  it('throws a HardwareWalletError on an unreadable v', () => {
    expect(() => yParityFrom('zz')).toThrow(HardwareWalletError)
  })
})

describe('signTransaction', () => {
  it('serializes a transaction that recovers to the connected account', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })

    const raw = await signer.signTransaction(txRequest)
    const parsed = Transaction.from(raw)
    expect(parsed.from).toBe(wallet.address)
    expect(parsed.to).toBe(TO)
    expect(parsed.chainId).toBe(137n)
    expect(session.signTransaction).toHaveBeenCalledWith(PATH, expect.any(String), expect.any(Object))
  })

  it('rejects when the device signed with a different account', async () => {
    const expected = new Wallet(PK_A)
    const actualDevice = new Wallet(PK_B)
    const session = sessionFor(actualDevice)
    const signer = new HardwareSigner(session, { path: PATH, address: expected.address })

    const err = await signer.signTransaction(txRequest).catch((e) => e)
    expect(err).toBeInstanceOf(HardwareWalletError)
    expect(err.message).toMatch(/different account/)
  })

  it('rejects a request whose from field is someone else, before touching the device', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })
    const other = new Wallet(PK_B)

    await expect(signer.signTransaction({ ...txRequest, from: other.address })).rejects.toThrow(
      /not from the connected hardware account/,
    )
    expect(session.signTransaction).not.toHaveBeenCalled()
  })
})

describe('signMessage', () => {
  it('returns the session signature verbatim, passing the path and message bytes', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    const fixed = '0x' + 'ab'.repeat(65)
    session.signPersonalMessage.mockResolvedValue(fixed)
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })

    await expect(signer.signMessage('hello device')).resolves.toBe(fixed)
    const [path, bytes] = session.signPersonalMessage.mock.calls[0]
    expect(path).toBe(PATH)
    expect(new TextDecoder().decode(bytes)).toBe('hello device')
  })
})

describe('signTypedData', () => {
  const domain = {
    name: 'FairWins WagerRegistry',
    version: '1',
    chainId: 137,
    verifyingContract: TO,
  }
  const types = {
    Mail: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  }
  const value = { to: TO, amount: 1n }

  it('hands the adapter the exact domainSeparator and hashStructMessage ethers computes', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    session.signTypedData.mockResolvedValue('0xsig')
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })

    await expect(signer.signTypedData(domain, types, value)).resolves.toBe('0xsig')
    const [path, payload] = session.signTypedData.mock.calls[0]
    expect(path).toBe(PATH)
    expect(payload.primaryType).toBe('Mail')
    expect(payload.domainSeparator).toBe(TypedDataEncoder.hashDomain(domain))
    expect(payload.hashStructMessage).toBe(TypedDataEncoder.from(types).hash(value))
    expect(payload.domain).toBe(domain)
    expect(payload.message).toBe(value)
  })

  it('tolerates an explicit EIP712Domain key in types', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    session.signTypedData.mockResolvedValue('0xsig')
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })

    const withDomain = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...types,
    }
    await signer.signTypedData(domain, withDomain, value)
    const [, payload] = session.signTypedData.mock.calls[0]
    expect(payload.hashStructMessage).toBe(TypedDataEncoder.from(types).hash(value))
  })

  it('fails with a stated outcome when the session cannot sign typed data', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    delete session.signTypedData
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address })
    await expect(signer.signTypedData(domain, types, value)).rejects.toThrow(HardwareWalletError)
  })
})

describe('signer identity', () => {
  it('getAddress returns the checksummed account and connect() keeps it', async () => {
    const wallet = new Wallet(PK_A)
    const session = sessionFor(wallet)
    const signer = new HardwareSigner(session, { path: PATH, address: wallet.address.toLowerCase() })
    await expect(signer.getAddress()).resolves.toBe(getAddress(wallet.address))
    const connected = signer.connect(null)
    expect(connected).toBeInstanceOf(HardwareSigner)
    await expect(connected.getAddress()).resolves.toBe(getAddress(wallet.address))
  })
})
