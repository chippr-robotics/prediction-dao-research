/**
 * SaveAddressToast (Spec 021, US4) — a dismissible, non-blocking prompt to save a
 * newly-used address to the address book after an action succeeds on-chain.
 *
 * Renders nothing when the address is already saved (FR-017) or invalid.
 * Dismissing/ignoring it never affects the completed action (FR-018).
 */

import { useState } from 'react'
import { useAddressBook } from '../../hooks/useAddressBook'
import { isValidAddress } from '../../lib/addressBook/addressBookStore'
import './SaveAddressToast.css'

function shorten(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function SaveAddressToast({ address, chainId, onSaved, onDismiss }) {
  const { findByAddress, addContact } = useAddressBook()
  const [nickname, setNickname] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState('')

  if (dismissed) return null
  if (!address || !isValidAddress(address)) return null
  // Already saved → never prompt (FR-017).
  if (findByAddress(address, chainId)) return null

  const handleSave = () => {
    if (nickname.trim() === '') {
      setError('Enter a nickname')
      return
    }
    addContact({ nickname: nickname.trim(), addresses: [{ address, chainId, notes: '' }] })
    setDismissed(true)
    onSaved?.()
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className="ab-toast" role="status" aria-live="polite">
      <span className="ab-toast-text">
        Save <code>{shorten(address)}</code> to your address book?
      </span>
      <input
        className="ab-toast-input"
        type="text"
        aria-label="Contact nickname"
        placeholder="Nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={60}
      />
      <button type="button" className="ab-btn ab-btn-sm ab-btn-primary" onClick={handleSave}>
        Save
      </button>
      <button type="button" className="ab-btn ab-btn-sm" onClick={handleDismiss} aria-label="Dismiss">
        Dismiss
      </button>
      {error && (
        <span className="ab-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
