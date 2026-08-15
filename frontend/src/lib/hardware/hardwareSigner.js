// Spec 085 — an ethers v6 Signer backed by a connected hardware-wallet session. This is what makes
// a saved hardware account able to ACT (operate-as, spec 062 recipe): the CustodyContext holds one
// of these in memory while the member operates as the account, exactly like the unlocked legacy
// signer — never persisted, cleared on any identity change.
//
// Every signing method routes through the device, so each call is a physical confirmation on the
// device's own screen. Nothing here can sign silently; that is the security property, not a
// limitation.

import { AbstractSigner, getAddress, Signature, Transaction, TypedDataEncoder } from 'ethers'
import { HardwareWalletError, HW_ERROR_CODES } from './errors'

const toBytes = (message) => (typeof message === 'string' ? new TextEncoder().encode(message) : message)

/** Normalize any vendor v (0/1 yParity, 27/28, or EIP-155 legacy v) to a yParity bit. */
export function yParityFrom(v) {
  const n = typeof v === 'string' ? parseInt(v, 16) : Number(v)
  if (!Number.isFinite(n)) throw new HardwareWalletError(HW_ERROR_CODES.UNKNOWN, 'Device returned an unreadable signature.')
  if (n >= 35) return (n - 35) % 2
  if (n >= 27) return n - 27
  return n & 1
}

export class HardwareSigner extends AbstractSigner {
  /**
   * @param {object} session adapter session from `connectHardware`
   * @param {{ path: string, address: string }} account
   * @param {import('ethers').Provider} [provider]
   */
  constructor(session, account, provider) {
    super(provider ?? null)
    this.session = session
    this.path = account.path
    this.address = getAddress(account.address)
    this.vendor = session.vendor
  }

  async getAddress() {
    return this.address
  }

  connect(provider) {
    return new HardwareSigner(this.session, { path: this.path, address: this.address }, provider)
  }

  async signMessage(message) {
    return this.session.signPersonalMessage(this.path, toBytes(message))
  }

  async signTypedData(domain, types, value) {
    if (typeof this.session.signTypedData !== 'function') {
      throw new HardwareWalletError(
        HW_ERROR_CODES.UNKNOWN,
        'This device session cannot sign typed data.',
      )
    }
    // Hand the adapter both forms: Ledger signs the two hashes, Trezor the full document.
    const cleanTypes = { ...types }
    delete cleanTypes.EIP712Domain
    const payload = {
      domain,
      types,
      primaryType: TypedDataEncoder.from(cleanTypes).primaryType,
      message: value,
      domainSeparator: TypedDataEncoder.hashDomain(domain),
      hashStructMessage: TypedDataEncoder.from(cleanTypes).hash(value),
    }
    return this.session.signTypedData(this.path, payload)
  }

  async signTransaction(txRequest) {
    const { from, ...fields } = txRequest
    if (from && getAddress(String(from)) !== this.address) {
      throw new HardwareWalletError(HW_ERROR_CODES.UNKNOWN, 'This transaction is not from the connected hardware account.')
    }
    const tx = Transaction.from({ ...fields, from: undefined })

    // Trezor signs from structured fields; Ledger from the unsigned serialization. Build both once.
    const hex = (v) => (v == null ? undefined : `0x${BigInt(v).toString(16)}`)
    const txFields = {
      to: tx.to || undefined,
      value: hex(tx.value ?? 0),
      data: tx.data && tx.data !== '0x' ? tx.data : '0x',
      chainId: Number(tx.chainId),
      nonce: hex(tx.nonce ?? 0),
      gasLimit: hex(tx.gasLimit ?? 0),
      ...(tx.type === 2
        ? { maxFeePerGas: hex(tx.maxFeePerGas ?? 0), maxPriorityFeePerGas: hex(tx.maxPriorityFeePerGas ?? 0) }
        : { gasPrice: hex(tx.gasPrice ?? 0) }),
    }

    const { r, s, v } = await this.session.signTransaction(this.path, tx.unsignedSerialized, txFields)
    tx.signature = Signature.from({ r, s, yParity: yParityFrom(v) })

    // The device is the authority on what was signed; recover and cross-check so a vendor-layer
    // mixup (wrong path, wrong account) can never broadcast silently from someone else's account.
    const recovered = Transaction.from(tx.serialized).from
    if (getAddress(recovered) !== this.address) {
      throw new HardwareWalletError(
        HW_ERROR_CODES.UNKNOWN,
        'The device signed with a different account than expected. Reconnect and try again.',
      )
    }
    return tx.serialized
  }
}

export default HardwareSigner
