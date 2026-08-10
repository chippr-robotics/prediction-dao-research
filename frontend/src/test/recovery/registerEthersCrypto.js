/**
 * Test-only shim: register @noble/hashes implementations for ethers' sha256 /
 * HMAC / PBKDF2 primitives.
 *
 * Under vitest+jsdom, Node's global `Buffer` leaks in and ethers' default
 * sha256 returns a Buffer that its own hexlify rejects ("invalid BytesLike
 * value … type: Buffer"), which breaks BIP-39 mnemonic parsing. Real browsers
 * have no `Buffer`, so ethers uses its pure-JS path and this shim is irrelevant
 * to production — it only makes the mnemonic code path testable here.
 */
import { ethers } from 'ethers'
import { sha256 as nobleSha256 } from '@noble/hashes/sha256'
import { sha512 as nobleSha512 } from '@noble/hashes/sha512'
import { hmac as nobleHmac } from '@noble/hashes/hmac'
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2'

const hashFor = (algo) => (algo === 'sha256' ? nobleSha256 : nobleSha512)

let registered = false
export function registerEthersCrypto() {
  if (registered) return
  registered = true
  ethers.sha256.register((data) => nobleSha256(data))
  ethers.computeHmac.register((algo, key, data) => nobleHmac(hashFor(algo), key, data))
  ethers.pbkdf2.register((password, salt, iterations, keylen, algo) =>
    noblePbkdf2(hashFor(algo), password, salt, { c: iterations, dkLen: keylen })
  )
}
