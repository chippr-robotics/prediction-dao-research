/**
 * ContactCard (Spec 021) — one address-book contact: nickname plus its grouped
 * addresses (network, shortened address, notes), each with an optional
 * sanctions RestrictionTag. A contact containing a restricted address is marked
 * at the contact level (FR-012).
 */

import { useState } from 'react'
import { addressKey } from '../../lib/addressBook/addressBookStore'
import RestrictionTag from './RestrictionTag'

function shorten(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const noStatus = () => 'clear'

function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}

function IconX() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="ab-icon">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  )
}

export default function ContactCard({
  contact,
  getStatus = noStatus,
  networkName = (id) => `Chain ${id}`,
  onEdit,
  onDeleteContact,
  onDeleteAddress,
}) {
  const [copiedKey, setCopiedKey] = useState(null)
  const statuses = contact.addresses.map((a) => getStatus(a.address, a.chainId))
  const containsRestricted = statuses.includes('restricted')

  function handleCopy(addr, key) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }

  return (
    <div className="ab-contact-card">
      <div className="ab-contact-head">
        <div className="ab-contact-name">
          <span className="ab-contact-nickname">{contact.nickname}</span>
          {containsRestricted && (
            <span className="ab-contact-restricted-flag">
              <RestrictionTag status="restricted" />
            </span>
          )}
        </div>
        <div className="ab-contact-actions">
          <button
            type="button"
            className="ab-btn ab-btn-sm"
            onClick={() => onEdit?.(contact)}
            aria-label={`Edit contact ${contact.nickname}`}
          >
            <IconEdit />
            <span className="ab-btn-label">Edit</span>
          </button>
          <button
            type="button"
            className="ab-btn ab-btn-sm ab-btn-danger"
            onClick={() => onDeleteContact?.(contact.id)}
            aria-label={`Delete contact ${contact.nickname}`}
          >
            <IconTrash />
            <span className="ab-btn-label">Delete</span>
          </button>
        </div>
      </div>

      <ul className="ab-address-list">
        {contact.addresses.map((a, i) => {
          const key = addressKey(a.address, a.chainId)
          const copied = copiedKey === key
          return (
            <li key={key} className="ab-address-row">
              <div className="ab-address-main">
                <code className="ab-address-value" title={a.address}>
                  {shorten(a.address)}
                </code>
                <button
                  type="button"
                  className={`ab-btn ab-btn-xs ab-copy-btn${copied ? ' ab-copy-btn--copied' : ''}`}
                  onClick={() => handleCopy(a.address, key)}
                  aria-label={`Copy address ${a.address}`}
                >
                  {copied ? <IconCheck /> : <IconCopy />}
                  <span className="ab-btn-label">{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <span className="ab-address-network">{networkName(a.chainId)}</span>
                <RestrictionTag status={statuses[i]} />
              </div>
              {a.notes && <p className="ab-address-notes">{a.notes}</p>}
              <button
                type="button"
                className="ab-btn ab-btn-xs ab-btn-danger"
                onClick={() => onDeleteAddress?.(contact.id, key)}
                aria-label={`Remove address ${shorten(a.address)} from ${contact.nickname}`}
              >
                <IconX />
                <span className="ab-btn-label">Remove</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
