import { describe, it, expect } from 'vitest'
import { exportAddressBook, importAddressBook } from '../../lib/addressBook/addressBookCrypto'
import { addContact, createEmptyBook } from '../../lib/addressBook/addressBookStore'

const ADDR = '0x1111111111111111111111111111111111111111'
const signerA = { signMessage: async () => '0xsignature-from-wallet-A' }
const signerB = { signMessage: async () => '0xsignature-from-wallet-B' }

function sampleBook() {
  return addContact(createEmptyBook(), {
    nickname: 'Alex',
    addresses: [{ address: ADDR, chainId: 137, notes: 'secret note' }],
  }).book
}

describe('addressBookCrypto', () => {
  it('round-trips with the same wallet (FR-019, FR-020)', async () => {
    const envelope = await exportAddressBook(sampleBook(), signerA)
    const restored = await importAddressBook(envelope, signerA)
    expect(restored.contacts).toHaveLength(1)
    expect(restored.contacts[0].nickname).toBe('Alex')
    expect(restored.contacts[0].addresses[0].address).toBe(ADDR)
    expect(restored.contacts[0].addresses[0].chainId).toBe(137)
    expect(restored.contacts[0].addresses[0].notes).toBe('secret note')
  })

  it('exposes no plaintext names/addresses/notes (FR-019)', async () => {
    const envelope = await exportAddressBook(sampleBook(), signerA)
    expect(envelope).not.toContain('Alex')
    expect(envelope).not.toContain('secret note')
    expect(envelope.toLowerCase()).not.toContain(ADDR.toLowerCase())
  })

  it('fails for a different wallet without revealing data (FR-021)', async () => {
    const envelope = await exportAddressBook(sampleBook(), signerA)
    await expect(importAddressBook(envelope, signerB)).rejects.toThrow(/different wallet|corrupted/i)
  })

  it('fails on a corrupt/invalid file (FR-021)', async () => {
    await expect(importAddressBook('{not valid', signerA)).rejects.toThrow()
    await expect(importAddressBook(JSON.stringify({ format: 'nope' }), signerA)).rejects.toThrow(
      /Unrecognised/i,
    )
  })

  it('rejects a tampered envelope (AEAD)', async () => {
    const envelope = JSON.parse(await exportAddressBook(sampleBook(), signerA))
    /*
     * The replacement is CONDITIONAL, matching backupCrypto.test.js:34 and claimCode.test.js:126.
     * It used to append a constant '00', which is a no-op whenever the ciphertext already ends in
     * '00' — nothing was tampered, the import legitimately succeeded, and the test failed with
     * "promise resolved instead of rejecting". Measured rate over 200k random ciphertexts: 0.022%,
     * about 1 run in 4,500 — rare enough to look like a mystery flake in a crypto test and read as
     * "AEAD did not detect tampering", which is alarming and was never true.
     */
    const tail = envelope.ciphertext.slice(-2)
    envelope.ciphertext = envelope.ciphertext.slice(0, -2) + (tail === '00' ? 'ff' : '00')
    await expect(importAddressBook(JSON.stringify(envelope), signerA)).rejects.toThrow()
  })
})
