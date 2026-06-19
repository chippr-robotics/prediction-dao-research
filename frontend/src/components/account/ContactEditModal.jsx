/**
 * ContactEditModal (Spec 021) — create or edit a contact and its addresses.
 *
 * Supports multiple addresses per contact (FR-002); each address has a required
 * network (defaulted to the active chain, FR-003) and optional notes. Validates
 * addresses before save (FR-005) and warns on duplicates (edge case).
 */

import { useState, useMemo } from 'react'
import { isValidAddress } from '../../lib/addressBook/addressBookStore'

function emptyRow(defaultChainId) {
  return { address: '', chainId: defaultChainId, notes: '' }
}

export default function ContactEditModal({
  contact = null,
  defaultChainId,
  networks = [],
  findDuplicate,
  onSave,
  onCancel,
}) {
  const isEdit = Boolean(contact)
  const [nickname, setNickname] = useState(contact?.nickname ?? '')
  const [rows, setRows] = useState(
    contact?.addresses?.length
      ? contact.addresses.map((a) => ({ address: a.address, chainId: a.chainId, notes: a.notes || '' }))
      : [emptyRow(defaultChainId)],
  )
  const [error, setError] = useState('')

  const setRow = (i, patch) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((prev) => [...prev, emptyRow(defaultChainId)])
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  // Duplicate warnings (advisory, do not block).
  const duplicateWarnings = useMemo(() => {
    if (!findDuplicate) return {}
    const out = {}
    rows.forEach((r, i) => {
      if (isValidAddress(r.address)) {
        const found = findDuplicate(r.address, Number(r.chainId))
        // Ignore a match against the contact being edited.
        if (found && (!contact || found.contact.id !== contact.id)) {
          out[i] = `Already saved under "${found.contact.nickname}"`
        }
      }
    })
    return out
  }, [rows, findDuplicate, contact])

  const handleSave = () => {
    if (nickname.trim() === '') {
      setError('Nickname is required')
      return
    }
    const cleaned = rows.filter((r) => r.address.trim() !== '')
    if (cleaned.length === 0) {
      setError('Add at least one address')
      return
    }
    for (const r of cleaned) {
      if (!isValidAddress(r.address)) {
        setError(`Enter a valid wallet address (${r.address || 'empty'})`)
        return
      }
      if (r.chainId === '' || r.chainId == null) {
        setError('Select a network for each address')
        return
      }
    }
    setError('')
    onSave?.({
      nickname: nickname.trim(),
      addresses: cleaned.map((r) => ({
        address: r.address.trim(),
        chainId: Number(r.chainId),
        notes: r.notes,
      })),
    })
  }

  return (
    <div className="ab-modal-backdrop" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit contact' : 'Add contact'}>
      <div className="ab-modal">
        <h3 className="ab-modal-title">{isEdit ? 'Edit contact' : 'Add contact'}</h3>

        <div className="ab-field">
          <label htmlFor="ab-nickname">Nickname *</label>
          <input
            id="ab-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        </div>

        <fieldset className="ab-addresses-fieldset">
          <legend>Addresses</legend>
          {rows.map((row, i) => (
            <div className="ab-address-edit-row" key={i}>
              <div className="ab-field">
                <label htmlFor={`ab-addr-${i}`}>Address *</label>
                <input
                  id={`ab-addr-${i}`}
                  type="text"
                  value={row.address}
                  onChange={(e) => setRow(i, { address: e.target.value })}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck="false"
                />
                {duplicateWarnings[i] && (
                  <span className="ab-warn" role="status">
                    {duplicateWarnings[i]}
                  </span>
                )}
              </div>
              <div className="ab-field">
                <label htmlFor={`ab-net-${i}`}>Network *</label>
                <select
                  id={`ab-net-${i}`}
                  value={row.chainId}
                  onChange={(e) => setRow(i, { chainId: e.target.value })}
                >
                  {networks.map((n) => (
                    <option key={n.chainId} value={n.chainId}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ab-field">
                <label htmlFor={`ab-notes-${i}`}>Notes</label>
                <input
                  id={`ab-notes-${i}`}
                  type="text"
                  value={row.notes}
                  onChange={(e) => setRow(i, { notes: e.target.value })}
                  maxLength={500}
                  autoComplete="off"
                />
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="ab-btn ab-btn-xs ab-btn-danger"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove address row ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="ab-btn ab-btn-sm" onClick={addRow}>
            + Add another address
          </button>
        </fieldset>

        {error && (
          <p className="ab-error" role="alert">
            {error}
          </p>
        )}

        <div className="ab-modal-actions">
          <button type="button" className="ab-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ab-btn ab-btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
