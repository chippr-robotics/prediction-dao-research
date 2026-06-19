/**
 * AddressInputBookAddon (Spec 021, US3) — the hook-driven address-book affordance
 * attached to AddressInput. Kept separate so AddressInput only pays for the
 * address-book hooks (which require a connected wallet context) when the feature
 * is explicitly enabled.
 */

import { useState, useMemo, useCallback } from 'react'
import { useAddressBook } from '../../hooks/useAddressBook'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { getNetwork } from '../../config/networks'
import { isValidAddress } from '../../lib/addressBook/addressBookStore'
import AddressBookPicker from './AddressBookPicker'
import RestrictionTag from '../account/RestrictionTag'
import './AddressBookField.css'

const netName = (id) => getNetwork(id)?.name || `Chain ${id}`

export default function AddressInputBookAddon({ query = '', chainId, resolvedAddress, onPick }) {
  const { search } = useAddressBook()
  const { getStatus } = useAddressScreening()
  const [open, setOpen] = useState(false)

  const entries = useMemo(() => search(query), [search, query])

  const handleSelect = useCallback(
    (entry) => {
      onPick?.(entry.address)
      setOpen(false)
    },
    [onPick],
  )

  const screenAddr =
    resolvedAddress && isValidAddress(resolvedAddress) ? resolvedAddress : null
  const status = screenAddr ? getStatus(screenAddr, chainId) : 'clear'

  return (
    <div className="ab-field-addon">
      <div className="ab-field-addon-row">
        <button
          type="button"
          className="ab-btn ab-btn-xs"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
        >
          Address book
        </button>
        {screenAddr && (status === 'restricted' || status === 'uncertain') && (
          <RestrictionTag status={status} />
        )}
      </div>
      {open &&
        (entries.length ? (
          <AddressBookPicker
            entries={entries}
            getStatus={getStatus}
            networkName={netName}
            onSelect={handleSelect}
          />
        ) : (
          <p className="ab-picker-empty" role="note">
            No saved contacts match.
          </p>
        ))}
    </div>
  )
}
