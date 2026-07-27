// Spec 068 — a vault is an address-book entry, so it is renamed and managed like any other address.
//
// The link is BY ADDRESS rather than a stored type, because `loadAddressBook` rebuilds each contact
// from a fixed field list — a `kind: 'vault'` key would be dropped on the next load, and the book is
// a synced object so a schema change also has to survive the merge. These tests pin that choice:
// naming resolves from the book, adding is non-destructive, and badging works without extra fields.

import { describe, it, expect, beforeEach } from 'vitest'
import { getAddress } from 'ethers'
import {
  defaultVaultNickname,
  ensureVaultContact,
  isVaultAddress,
  renameVault,
  vaultDisplayName,
} from '../../lib/custody/vaultAddressBook'
import { loadAddressBook, saveAddressBook, createEmptyBook, addContact } from '../../lib/addressBook/addressBookStore'

const OWNER = getAddress('0x9999999999999999999999999999999999999999')
const VAULT = getAddress('0x8cc564E3dF4003c2F0a33C679c8DfE6237c5c3fa')
const OTHER = getAddress('0x1111111111111111111111111111111111111111')

const vault = (over = {}) => ({ address: VAULT, chainId: 137, label: '', ...over })

beforeEach(() => {
  localStorage.clear()
})

describe('vaultAddressBook', () => {
  it('names an unnamed vault after its address, not "undefined"', () => {
    expect(defaultVaultNickname(vault())).toMatch(/^Vault 0x8cc5/)
    expect(defaultVaultNickname(vault({ label: 'Team treasury' }))).toBe('Team treasury')
  })

  it('adds the vault to the address book', () => {
    const contact = ensureVaultContact(OWNER, vault({ label: 'Team treasury' }))
    expect(contact.nickname).toBe('Team treasury')

    const book = loadAddressBook(OWNER)
    expect(book.contacts).toHaveLength(1)
    expect(book.contacts[0].addresses[0]).toMatchObject({ address: VAULT, chainId: 137 })
  })

  it('is idempotent — adding the same vault twice does not duplicate it', () => {
    ensureVaultContact(OWNER, vault())
    ensureVaultContact(OWNER, vault())
    expect(loadAddressBook(OWNER).contacts).toHaveLength(1)
  })

  it('NEVER overwrites a name the member chose', () => {
    ensureVaultContact(OWNER, vault({ label: 'Original' }))
    renameVault(OWNER, vault(), 'What I actually call it')

    // Re-adding (e.g. the vault is loaded again, or refresh re-runs) must not reset the name.
    ensureVaultContact(OWNER, vault({ label: 'Original' }))
    expect(vaultDisplayName(loadAddressBook(OWNER), vault())).toBe('What I actually call it')
  })

  it('resolves the display name from the book, falling back sensibly', () => {
    const empty = createEmptyBook()
    // Nothing in the book: fall back to the custody reference's own label…
    expect(vaultDisplayName(empty, vault({ label: 'From reference' }))).toBe('From reference')
    // …then to a shortened address, so a vault always has SOME name.
    expect(vaultDisplayName(empty, vault())).toMatch(/^0x8cc5/)

    // Once the book knows it, the book wins — that is where renaming happens.
    ensureVaultContact(OWNER, vault({ label: 'From reference' }))
    renameVault(OWNER, vault(), 'From the book')
    expect(vaultDisplayName(loadAddressBook(OWNER), vault({ label: 'From reference' }))).toBe('From the book')
  })

  it('matches a vault by address and chain for badging', () => {
    const refs = [{ address: VAULT, chainId: 137 }]
    expect(isVaultAddress(refs, VAULT, 137)).toBe(true)
    expect(isVaultAddress(refs, VAULT.toLowerCase(), 137)).toBe(true) // checksum-insensitive
    expect(isVaultAddress(refs, VAULT, 8453)).toBe(false) // same address, different chain
    expect(isVaultAddress(refs, OTHER, 137)).toBe(false)
    expect(isVaultAddress(refs, 'not-an-address', 137)).toBe(false)
    expect(isVaultAddress(null, VAULT, 137)).toBe(false)
  })

  it('leaves an ordinary contact at the same address alone', () => {
    // A member may already have the vault saved as a normal contact. ensureVaultContact must adopt
    // that entry rather than creating a second one for the same address.
    const { book } = addContact(createEmptyBook(), {
      nickname: 'Saved earlier',
      addresses: [{ address: VAULT, chainId: 137, notes: '' }],
    })
    saveAddressBook(OWNER, book)

    ensureVaultContact(OWNER, vault({ label: 'Team treasury' }))
    const after = loadAddressBook(OWNER)
    expect(after.contacts).toHaveLength(1)
    expect(after.contacts[0].nickname).toBe('Saved earlier')
  })

  it('ignores incomplete input rather than writing junk', () => {
    expect(ensureVaultContact(null, vault())).toBeNull()
    expect(ensureVaultContact(OWNER, { address: VAULT })).toBeNull() // no chainId
    expect(loadAddressBook(OWNER).contacts).toHaveLength(0)
  })
})
