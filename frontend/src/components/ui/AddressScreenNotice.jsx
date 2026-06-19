/**
 * AddressScreenNotice (Spec 021 iteration 2) — inline advisory screening notice
 * for a single address (e.g. the opponent entered on the wager-create form).
 * Shows a RestrictionTag plus short text when the address screens as restricted
 * or unscreened; renders nothing when clear/empty.
 */

import { useEffect } from 'react'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { isValidAddress } from '../../lib/addressBook/addressBookStore'
import RestrictionTag from '../account/RestrictionTag'
import ScreeningInfoButton from './ScreeningInfoButton'

const MESSAGES = {
  restricted: 'This address is flagged by sanctions screening. Creating a wager with it will be blocked on-chain.',
  uncertain: 'This address could not be screened on this network. Proceed with caution.',
}

export default function AddressScreenNotice({ address, chainId }) {
  const { getStatus, screen } = useAddressScreening()
  const valid = address && isValidAddress(address)

  useEffect(() => {
    if (valid) screen([{ address, chainId }])
  }, [valid, address, chainId, screen])

  if (!valid) return null
  const status = getStatus(address, chainId)
  if (status !== 'restricted' && status !== 'uncertain') return null

  return (
    <div className="ab-screen-notice" role="status">
      <RestrictionTag status={status} />
      <span className="ab-screen-notice-text">{MESSAGES[status]}</span>
      <ScreeningInfoButton />
    </div>
  )
}
