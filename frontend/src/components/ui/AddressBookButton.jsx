/**
 * AddressBookButton (Spec 021 iteration 2) — a compact icon button that opens a
 * searchable popover of the member's saved addresses. Designed to sit inline
 * next to the QR-scan button on the wager-create form (it reuses the same
 * sizing class), so picking a saved contact is one tap away.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useAddressBook } from '../../hooks/useAddressBook'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { getNetwork } from '../../config/networks'
import AddressBookPicker from './AddressBookPicker'
import ScreeningInfoButton from './ScreeningInfoButton'
import './AddressBookField.css'

const netName = (id) => getNetwork(id)?.name || `Chain ${id}`

export default function AddressBookButton({ onSelect, disabled = false }) {
  const { search } = useAddressBook()
  const { getStatus, screen } = useAddressScreening()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  const entries = useMemo(() => search(query), [search, query])

  // Screen the visible results when the popover opens.
  useEffect(() => {
    if (open && entries.length) screen(entries)
  }, [open, entries, screen])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSelect = useCallback(
    (entry) => {
      onSelect?.(entry)
      setOpen(false)
      setQuery('')
    },
    [onSelect],
  )

  return (
    <span className="ab-book-btn-wrap" ref={wrapRef}>
      <button
        type="button"
        className="fm-scan-btn ab-book-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose from address book"
        title="Address book"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <circle cx="12" cy="9" r="2" />
          <path d="M9 14a3 3 0 0 1 6 0" />
        </svg>
      </button>

      {open && (
        <div className="ab-book-popover" role="dialog" aria-label="Address book">
          <div className="ab-book-popover-head">
            <input
              type="search"
              className="ab-book-search"
              placeholder="Search saved addresses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search saved addresses"
              autoFocus
            />
            <ScreeningInfoButton />
          </div>
          {entries.length ? (
            <AddressBookPicker
              entries={entries}
              getStatus={getStatus}
              networkName={netName}
              onSelect={handleSelect}
            />
          ) : (
            <p className="ab-picker-empty" role="note">
              {query ? 'No saved contacts match.' : 'No saved contacts yet.'}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
