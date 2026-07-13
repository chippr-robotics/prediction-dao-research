/**
 * AddressBookPanel (Spec 021) — the My Account → Address Book tab body.
 *
 * Per-wallet CRUD over saved contacts (FR-001..FR-009), with advisory sanctions
 * tags screened on open (FR-010..FR-012), in-panel search (FR-015), and (added
 * in US5) encrypted export/import.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { useAddressBook } from '../../hooks/useAddressBook'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { getNetwork, getSelectableNetworks, getCurrentChainId } from '../../config/networks'
import { addressKey, listEntries } from '../../lib/addressBook/addressBookStore'
function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
    </svg>
  )
}

import ContactCard from './ContactCard'
import ContactEditModal from './ContactEditModal'
import AddressBookImportExport from './AddressBookImportExport'
import ScreeningInfoButton from '../ui/ScreeningInfoButton'
import './AddressBookPanel.css'

function networkName(chainId) {
  return getNetwork(chainId)?.name || `Chain ${chainId}`
}

export default function AddressBookPanel({ address }) {
  const wallet = useWallet()
  const activeChainId = wallet?.chainId ?? getCurrentChainId()
  const {
    book,
    contacts,
    addContact,
    updateContact,
    deleteContact,
    addAddress,
    removeAddress,
    findByAddress,
  } = useAddressBook()
  const { getStatus, screen } = useAddressScreening()

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { contact } | { contact: null } | null

  const networks = useMemo(() => getSelectableNetworks(), [])

  // Screen visible addresses when the book opens or changes (FR-010, Q5).
  useEffect(() => {
    const entries = listEntries(book)
    if (entries.length) screen(entries)
  }, [book, screen])

  // Filter contacts by the search query (nickname or any address) (FR-015).
  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.nickname.toLowerCase().includes(q) ||
        c.addresses.some((a) => a.address.toLowerCase().includes(q)),
    )
  }, [contacts, query])

  const handleSave = useCallback(
    (draft) => {
      if (editing?.contact) {
        // Edit: update nickname, then reconcile addresses (add new, drop removed).
        const contact = editing.contact
        updateContact(contact.id, { nickname: draft.nickname })
        const existingKeys = new Set(
          contact.addresses.map((a) => addressKey(a.address, a.chainId)),
        )
        const draftKeys = new Set(draft.addresses.map((a) => addressKey(a.address, a.chainId)))
        draft.addresses.forEach((a) => {
          if (!existingKeys.has(addressKey(a.address, a.chainId))) {
            addAddress(contact.id, a)
          }
        })
        contact.addresses.forEach((a) => {
          const key = addressKey(a.address, a.chainId)
          if (!draftKeys.has(key)) removeAddress(contact.id, key)
        })
      } else {
        addContact(draft)
      }
      setEditing(null)
    },
    [editing, addContact, updateContact, addAddress, removeAddress],
  )

  if (!address) {
    return (
      <div className="ab-panel">
        <div className="ab-empty" role="note">
          <h3>Address Book</h3>
          <p>Connect your wallet to manage your saved contacts.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ab-panel">
      <div className="ab-panel-head">
        <div className="ab-panel-head-titles">
          <h3>Address Book</h3>
          <ScreeningInfoButton />
        </div>
        <div className="ab-panel-head-actions">
          <AddressBookImportExport />
          <button
            type="button"
            className="ab-btn ab-btn-primary"
            onClick={() => setEditing({ contact: null })}
            aria-label="Add contact"
          >
            <IconPlus />
            <span className="ab-btn-label">Add contact</span>
          </button>
        </div>
      </div>

      <div className="ab-field ab-search">
        <label htmlFor="ab-search">Search</label>
        <input
          id="ab-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or address"
          autoComplete="off"
        />
      </div>

      {contacts.length === 0 ? (
        <div className="ab-empty" role="note">
          <p>No saved contacts yet. Add a contact to find friends faster when you wager.</p>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="ab-empty" role="note">
          <p>No contacts match “{query}”.</p>
        </div>
      ) : (
        <div className="ab-contact-grid">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              getStatus={getStatus}
              networkName={networkName}
              onEdit={(c) => setEditing({ contact: c })}
              onDeleteContact={deleteContact}
            />
          ))}
        </div>
      )}

      {editing && (
        <ContactEditModal
          contact={editing.contact}
          defaultChainId={activeChainId}
          networks={networks}
          findDuplicate={findByAddress}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
