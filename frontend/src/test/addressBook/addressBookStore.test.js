import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEmptyBook,
  normalizeAddress,
  isValidAddress,
  addressKey,
  addContact,
  updateContact,
  deleteContact,
  addAddress,
  updateAddress,
  removeAddress,
  findByAddress,
  listEntries,
  searchEntries,
  mergeBook,
  applyConflictResolutions,
  loadAddressBook,
  saveAddressBook,
} from '../../lib/addressBook/addressBookStore'

const A1 = '0x1111111111111111111111111111111111111111'
const A2 = '0x2222222222222222222222222222222222222222'
// A letterful address in lowercase and its EIP-55 checksummed form (same bytes,
// different capitalisation) — used to prove case-insensitive matching.
const A_LC = '0x52908400098527886e0f7030069857d2e4169ee7'
const A_CHK = '0x52908400098527886E0F7030069857D2E4169EE7'

describe('addressBookStore — validation & identity', () => {
  it('normalizeAddress checksums valid input and rejects invalid (FR-005)', () => {
    expect(normalizeAddress(A1).toLowerCase()).toBe(A1)
    expect(() => normalizeAddress('not-an-address')).toThrow()
    expect(() => normalizeAddress('')).toThrow()
  })

  it('isValidAddress reflects address validity', () => {
    expect(isValidAddress(A1)).toBe(true)
    expect(isValidAddress('nope')).toBe(false)
  })

  it('addressKey is case-insensitive and network-scoped (FR-007)', () => {
    expect(addressKey(A_LC, 137)).toBe(addressKey(A_CHK, 137))
    expect(addressKey(A1, 137)).not.toBe(addressKey(A1, 63))
  })
})

describe('addressBookStore — CRUD', () => {
  it('adds a contact with multiple addresses on different networks (FR-002, FR-003)', () => {
    const { book, contact } = addContact(createEmptyBook(), {
      nickname: 'Alex',
      addresses: [
        { address: A1, chainId: 137, notes: 'main' },
        { address: A1, chainId: 63, notes: 'mordor' },
      ],
    })
    expect(book.contacts).toHaveLength(1)
    expect(contact.addresses).toHaveLength(2)
    expect(contact.nickname).toBe('Alex')
  })

  it('requires a nickname and a network', () => {
    expect(() => addContact(createEmptyBook(), { nickname: '   ' })).toThrow()
    expect(() =>
      addContact(createEmptyBook(), {
        nickname: 'X',
        addresses: [{ address: A1, chainId: undefined }],
      }),
    ).toThrow(/network/i)
  })

  it('edits and deletes contacts and individual addresses (FR-004)', () => {
    let { book, contact } = addContact(createEmptyBook(), {
      nickname: 'Alex',
      addresses: [{ address: A1, chainId: 137 }],
    })
    book = addAddress(book, contact.id, { address: A2, chainId: 137, notes: 'alt' })
    expect(book.contacts[0].addresses).toHaveLength(2)

    book = updateContact(book, contact.id, { nickname: 'Alexander' })
    expect(book.contacts[0].nickname).toBe('Alexander')

    book = updateAddress(book, contact.id, addressKey(A2, 137), { notes: 'updated' })
    expect(book.contacts[0].addresses.find((a) => a.address.toLowerCase() === A2).notes).toBe(
      'updated',
    )

    book = removeAddress(book, contact.id, addressKey(A1, 137))
    expect(book.contacts[0].addresses).toHaveLength(1)

    book = deleteContact(book, contact.id)
    expect(book.contacts).toHaveLength(0)
  })

  it('does not mutate the input book (purity)', () => {
    const base = createEmptyBook()
    addContact(base, { nickname: 'Alex', addresses: [{ address: A1, chainId: 137 }] })
    expect(base.contacts).toHaveLength(0)
  })
})

describe('addressBookStore — queries', () => {
  let book
  beforeEach(() => {
    book = addContact(createEmptyBook(), {
      nickname: 'Alex',
      addresses: [
        { address: A_LC, chainId: 137, notes: 'main' },
        { address: A2, chainId: 63 },
      ],
    }).book
  })

  it('findByAddress matches regardless of case and respects network (FR-007)', () => {
    // Stored checksummed; looked up via a differently-cased form.
    expect(findByAddress(book, A_CHK, 137)).not.toBeNull()
    expect(findByAddress(book, A_LC, 63)).toBeNull()
  })

  it('searchEntries matches nickname or address substrings (FR-015)', () => {
    expect(searchEntries(book, 'ale')).toHaveLength(2)
    expect(searchEntries(book, A2.slice(0, 6))).toHaveLength(1)
    expect(listEntries(book)).toHaveLength(2)
  })

  it('searchEntries is fast over 200+ entries (SC-006)', () => {
    let big = createEmptyBook()
    for (let i = 0; i < 220; i++) {
      const addr = '0x' + (i + 1).toString(16).padStart(40, '0')
      big = addContact(big, { nickname: `friend${i}`, addresses: [{ address: addr, chainId: 137 }] }).book
    }
    const start = performance.now()
    const res = searchEntries(big, 'friend1')
    const elapsed = performance.now() - start
    expect(res.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('addressBookStore — merge (additive, FR-022)', () => {
  it('adds new addresses, keeps existing, surfaces metadata conflicts', () => {
    const current = addContact(createEmptyBook(), {
      nickname: 'Alex',
      addresses: [{ address: A1, chainId: 137, notes: 'mine' }],
    }).book
    const incoming = addContact(createEmptyBook(), {
      nickname: 'Alexander', // differs → conflict
      addresses: [
        { address: A1, chainId: 137, notes: 'theirs' }, // overlap
        { address: A2, chainId: 137, notes: 'new' }, // additive
      ],
    }).book

    const { book, conflicts } = mergeBook(current, incoming)
    expect(listEntries(book)).toHaveLength(2) // no duplicate of A1
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].addressKey).toBe(addressKey(A1, 137))

    // keep existing → unchanged nickname/notes
    const kept = applyConflictResolutions(book, conflicts, {})
    expect(kept.contacts[0].nickname).toBe('Alex')

    // take incoming → applies imported metadata
    const taken = applyConflictResolutions(book, conflicts, {
      [addressKey(A1, 137)]: 'incoming',
    })
    expect(taken.contacts[0].nickname).toBe('Alexander')
  })

  it('never deletes existing local-only data', () => {
    const current = addContact(createEmptyBook(), {
      nickname: 'Local',
      addresses: [{ address: A2, chainId: 63 }],
    }).book
    const incoming = addContact(createEmptyBook(), {
      nickname: 'Remote',
      addresses: [{ address: A1, chainId: 137 }],
    }).book
    const { book } = mergeBook(current, incoming)
    expect(findByAddress(book, A2, 63)).not.toBeNull()
    expect(findByAddress(book, A1, 137)).not.toBeNull()
  })
})

describe('addressBookStore — persistence (per-wallet)', () => {
  const owner = '0x9999999999999999999999999999999999999999'
  const other = '0x8888888888888888888888888888888888888888'

  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips through localStorage and isolates per wallet (FR-006, FR-009)', () => {
    const { book } = addContact(createEmptyBook(), {
      nickname: 'Alex',
      addresses: [{ address: A1, chainId: 137 }],
    })
    saveAddressBook(owner, book)

    const reloaded = loadAddressBook(owner)
    expect(reloaded.contacts).toHaveLength(1)

    // A different wallet sees an empty book (no leakage).
    expect(loadAddressBook(other).contacts).toHaveLength(0)
  })

  it('returns an empty book on missing/corrupt data', () => {
    expect(loadAddressBook(owner).contacts).toHaveLength(0)
    localStorage.setItem(`fw_user_${owner.toLowerCase()}_addressBook`, '{not json')
    expect(loadAddressBook(owner).contacts).toHaveLength(0)
  })
})
