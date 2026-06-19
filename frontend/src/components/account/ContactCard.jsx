/**
 * ContactCard (Spec 021) — one address-book contact: nickname plus its grouped
 * addresses (network, shortened address, notes), each with an optional
 * sanctions RestrictionTag. A contact containing a restricted address is marked
 * at the contact level (FR-012).
 */

import { addressKey } from '../../lib/addressBook/addressBookStore'
import RestrictionTag from './RestrictionTag'

function shorten(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const noStatus = () => 'clear'

export default function ContactCard({
  contact,
  getStatus = noStatus,
  networkName = (id) => `Chain ${id}`,
  onEdit,
  onDeleteContact,
  onDeleteAddress,
}) {
  const statuses = contact.addresses.map((a) => getStatus(a.address, a.chainId))
  const containsRestricted = statuses.includes('restricted')

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
          <button type="button" className="ab-btn ab-btn-sm" onClick={() => onEdit?.(contact)}>
            Edit
          </button>
          <button
            type="button"
            className="ab-btn ab-btn-sm ab-btn-danger"
            onClick={() => onDeleteContact?.(contact.id)}
            aria-label={`Delete contact ${contact.nickname}`}
          >
            Delete
          </button>
        </div>
      </div>

      <ul className="ab-address-list">
        {contact.addresses.map((a, i) => {
          const key = addressKey(a.address, a.chainId)
          return (
            <li key={key} className="ab-address-row">
              <div className="ab-address-main">
                <code className="ab-address-value" title={a.address}>
                  {shorten(a.address)}
                </code>
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
                Remove
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
