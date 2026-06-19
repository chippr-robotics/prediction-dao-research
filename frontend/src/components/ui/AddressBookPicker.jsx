/**
 * AddressBookPicker (Spec 021, US3) — presentational searchable result list of
 * saved addresses. Each result shows nickname, shortened address, network, and
 * a sanctions RestrictionTag. Renders nothing when there are no entries so an
 * empty book offers no misleading results (edge case).
 */

import RestrictionTag from '../account/RestrictionTag'
import './AddressBookField.css'

function shorten(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function AddressBookPicker({
  entries = [],
  getStatus = () => 'clear',
  networkName = (id) => `Chain ${id}`,
  onSelect,
}) {
  if (!entries.length) return null
  return (
    <ul className="ab-picker-list" aria-label="Saved addresses">
      {entries.map((e) => (
        <li key={`${e.contactId}:${e.address.toLowerCase()}:${e.chainId}`}>
          <button type="button" className="ab-picker-option" onClick={() => onSelect?.(e)}>
            <span className="ab-picker-nick">{e.nickname}</span>
            <code className="ab-picker-addr">{shorten(e.address)}</code>
            <span className="ab-address-network">{networkName(e.chainId)}</span>
            <RestrictionTag status={getStatus(e.address, e.chainId)} />
          </button>
        </li>
      ))}
    </ul>
  )
}
