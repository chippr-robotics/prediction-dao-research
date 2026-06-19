/**
 * AddressBookImportExport (Spec 021, US5) — encrypted export/import controls and
 * the merge-conflict resolution flow.
 */

import { useState, useRef, useCallback } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { useAddressBook } from '../../hooks/useAddressBook'
import { exportAddressBook, importAddressBook } from '../../lib/addressBook/addressBookCrypto'

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function AddressBookImportExport() {
  const { signer } = useWallet()
  const { book, importBook, resolveConflicts } = useAddressBook()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'error'|'success', text }
  const [conflicts, setConflicts] = useState([])
  const [resolutions, setResolutions] = useState({})

  const handleExport = useCallback(async () => {
    setMessage(null)
    setBusy(true)
    try {
      const envelope = await exportAddressBook(book, signer)
      downloadFile(`fairwins-address-book-${Date.now()}.json`, envelope)
      setMessage({ type: 'success', text: 'Address book exported.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Export failed' })
    } finally {
      setBusy(false)
    }
  }, [book, signer])

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      if (file) {
        event.target.value = '' // allow re-importing the same file
        setMessage(null)
        setBusy(true)
        try {
          const text = await file.text()
          const incoming = await importAddressBook(text, signer)
          const { conflicts: found } = importBook(incoming)
          if (found.length > 0) {
            setConflicts(found)
            setResolutions({})
            setMessage({ type: 'success', text: 'Imported. Resolve the conflicts below.' })
          } else {
            setMessage({ type: 'success', text: 'Address book imported.' })
          }
        } catch (err) {
          // Existing book is left unchanged (FR-021).
          setMessage({ type: 'error', text: err.message || 'Import failed' })
        } finally {
          setBusy(false)
        }
      }
    },
    [signer, importBook],
  )

  const applyResolutions = useCallback(() => {
    resolveConflicts(conflicts, resolutions)
    setConflicts([])
    setResolutions({})
    setMessage({ type: 'success', text: 'Conflicts resolved.' })
  }, [conflicts, resolutions, resolveConflicts])

  return (
    <div className="ab-import-export">
      <button type="button" className="ab-btn ab-btn-sm" onClick={handleExport} disabled={busy}>
        Export
      </button>
      <button
        type="button"
        className="ab-btn ab-btn-sm"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="ab-import-input"
      />

      {message && (
        <span
          className={message.type === 'error' ? 'ab-error' : 'ab-warn'}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </span>
      )}

      {conflicts.length > 0 && (
        <div className="ab-conflict-list" role="group" aria-label="Resolve import conflicts">
          {conflicts.map((c) => (
            <div className="ab-conflict" key={c.addressKey}>
              <strong>{c.addressKey}</strong>
              <div className="ab-conflict-choices">
                <label>
                  <input
                    type="radio"
                    name={`conflict-${c.addressKey}`}
                    checked={(resolutions[c.addressKey] ?? 'keep') === 'keep'}
                    onChange={() =>
                      setResolutions((r) => ({ ...r, [c.addressKey]: 'keep' }))
                    }
                  />
                  Keep “{c.existing.nickname}”
                </label>
                <label>
                  <input
                    type="radio"
                    name={`conflict-${c.addressKey}`}
                    checked={resolutions[c.addressKey] === 'incoming'}
                    onChange={() =>
                      setResolutions((r) => ({ ...r, [c.addressKey]: 'incoming' }))
                    }
                  />
                  Use “{c.incoming.nickname}”
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="ab-btn ab-btn-sm ab-btn-primary" onClick={applyResolutions}>
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
