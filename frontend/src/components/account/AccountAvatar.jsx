/**
 * Spec 086 (FR-003) — THE account identity image, everywhere one appears: the member-set profile
 * picture when this device has one, the Blockies identicon otherwise. Same behavior at every
 * size; reactive, so setting a picture in the Customize sheet updates the header button, the
 * switcher rows and every card in the same frame.
 *
 * Render this — not BlockiesAvatar — anywhere an account's identity is shown. BlockiesAvatar
 * stays the fallback engine underneath (and existing test mocks of it keep working).
 */

import { useMemo, useSyncExternalStore } from 'react'
import PropTypes from 'prop-types'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import {
  getAccountProfile,
  getAccountProfilesRevision,
  subscribeAccountProfiles,
} from '../../lib/account/accountProfilesStore'

export default function AccountAvatar({ address, size = 40, className = '', alt }) {
  const revision = useSyncExternalStore(subscribeAccountProfiles, getAccountProfilesRevision)
  const image = useMemo(
    () => (address ? getAccountProfile(address)?.image ?? null : null),
    // The store lives outside React, so the revision IS the dependency that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, revision],
  )

  if (image) {
    return (
      <img
        src={image}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`account-avatar account-avatar--custom ${className}`.trim()}
        alt={alt ?? `Avatar for account ${address}`}
      />
    )
  }
  return <BlockiesAvatar address={address} size={size} className={className} alt={alt} />
}

AccountAvatar.propTypes = {
  address: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  alt: PropTypes.string,
}
