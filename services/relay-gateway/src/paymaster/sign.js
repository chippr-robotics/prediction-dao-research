/**
 * Sponsorship signer (spec 050). Produces the ECDSA signature the verifying paymaster checks:
 * `recover(toEthSignedMessageHash(getHash), sig) == verifyingSigner`.
 *
 * Two adapters behind one interface (`{ address, sign(hash) }`), mirroring the relayer's
 * dev-key-vs-KMS split:
 *   - `createLocalSigner(privateKey)` — dev/test/CI (a raw key; NEVER a production secret).
 *   - `createKmsSigner(kmsKeyName)`   — production: Google Cloud KMS secp256k1, same custody class
 *                                        as the relayer gas key. Dynamically imported so dev/test
 *                                        needs no KMS package.
 * The signer is injected at `createApp` (like `engineClient`) so tests use the local adapter.
 */
import { ethers } from 'ethers'

/** @typedef {{ address: string, sign: (hash: string) => Promise<string> }} SponsorshipSigner */

/** @returns {SponsorshipSigner} */
export function createLocalSigner(privateKey) {
  const wallet = new ethers.Wallet(privateKey)
  return {
    address: ethers.getAddress(wallet.address),
    // EIP-191 personal_sign over the 32-byte hash == the contract's
    // MessageHashUtils.toEthSignedMessageHash + ECDSA.recover path.
    async sign(hash) {
      return wallet.signMessage(ethers.getBytes(hash))
    },
  }
}

/**
 * Production KMS signer. Signs the EIP-191 digest of `hash` with a Cloud KMS secp256k1 key and
 * assembles a 65-byte {r,s,v} recoverable to the key's Ethereum address.
 * @returns {Promise<SponsorshipSigner>}
 */
export async function createKmsSigner(kmsKeyName) {
  const { KeyManagementServiceClient } = await import('@google-cloud/kms')
  const client = new KeyManagementServiceClient()

  // Derive the signer's Ethereum address from the KMS public key (SPKI DER → uncompressed point).
  const [pub] = await client.getPublicKey({ name: kmsKeyName })
  const address = ethers.computeAddress('0x' + spkiDerToRawPubKey(pub.pem))

  return {
    address,
    async sign(hash) {
      const digest = ethers.getBytes(ethers.hashMessage(ethers.getBytes(hash))) // EIP-191 digest
      const [res] = await client.asymmetricSign({ name: kmsKeyName, digest: { sha256: digest } })
      const { r, s } = derToRs(res.signature) // low-S normalized
      // recover v by trying both parities against the known address
      for (const v of [27, 28]) {
        const sig = ethers.Signature.from({ r, s, v })
        if (ethers.recoverAddress(ethers.hashMessage(ethers.getBytes(hash)), sig) === address) {
          return sig.serialized
        }
      }
      throw new Error('KMS signature: could not recover signer parity')
    },
  }
}

// --- helpers (KMS DER parsing); exercised only in production, kept minimal + pure ---------------

/** SubjectPublicKeyInfo PEM → 128-hex-char raw (x||y) uncompressed public key (drops the 0x04 tag). */
export function spkiDerToRawPubKey(pem) {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
  // The uncompressed EC point is the trailing 65 bytes (0x04 || X(32) || Y(32)) of the SPKI.
  const point = der.subarray(der.length - 65)
  if (point[0] !== 0x04) throw new Error('KMS public key is not an uncompressed EC point')
  return point.subarray(1).toString('hex')
}

/** DER ECDSA signature (Buffer/Uint8Array) → { r, s } hex, with low-S normalization (EIP-2). */
export function derToRs(der) {
  const buf = Buffer.from(der)
  let o = 2 // skip SEQUENCE tag+len
  if (buf[o] !== 0x02) throw new Error('bad DER: r')
  const rLen = buf[o + 1]
  let r = buf.subarray(o + 2, o + 2 + rLen)
  o = o + 2 + rLen
  if (buf[o] !== 0x02) throw new Error('bad DER: s')
  const sLen = buf[o + 1]
  let s = buf.subarray(o + 2, o + 2 + sLen)

  const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
  const toBig = (b) => BigInt('0x' + b.toString('hex'))
  let sBig = toBig(s)
  if (sBig > N / 2n) sBig = N - sBig // low-S
  const hex32 = (n) => '0x' + n.toString(16).padStart(64, '0')
  return { r: hex32(toBig(r) & ((1n << 256n) - 1n)), s: hex32(sBig) }
}
