/**
 * Spec 086 (FR-008) — the ONE surface for customizing an account's card, opened from any account
 * card. Changes apply immediately (the store is reactive), so the member watches the header
 * avatar, the switcher and the card itself update live; "Reset card" returns to the defaults.
 *
 * Everything happens on-device: the picture is downscaled locally and stored as a small data URL
 * (never uploaded), and tints/patterns are token ids the CSS interprets per theme.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import PropTypes from 'prop-types'
import ActionSheet from './ActionSheet'
import AccountAvatar from './AccountAvatar'
import {
  CARD_TINTS,
  CARD_PATTERNS,
  getAccountProfile,
  getAccountProfilesRevision,
  subscribeAccountProfiles,
  setAccountProfile,
  clearAccountProfile,
} from '../../lib/account/accountProfilesStore'
import { processProfileImage } from '../../lib/account/profileImage'
import './AccountCustomizeSheet.css'

const TINT_LABEL = {
  none: 'Default',
  mint: 'Mint',
  sky: 'Sky',
  violet: 'Violet',
  amber: 'Amber',
  rose: 'Rose',
  slate: 'Slate',
}

const PATTERN_LABEL = {
  none: 'Plain',
  waves: 'Waves',
  dots: 'Dots',
  grid: 'Grid',
  rings: 'Rings',
}

export default function AccountCustomizeSheet({ open, onClose, account }) {
  useSyncExternalStore(subscribeAccountProfiles, getAccountProfilesRevision)
  const profile = account?.address ? getAccountProfile(account.address) : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const address = account?.address
  const tint = profile?.tint ?? 'none'
  const pattern = profile?.pattern ?? 'none'

  const close = useCallback(() => {
    if (busy) return
    setError(null)
    onClose?.()
  }, [busy, onClose])

  const pickImage = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      event.target.value = '' // same file can be picked again after an error
      if (!file || !address) return
      setError(null)
      setBusy(true)
      try {
        const image = await processProfileImage(file)
        setAccountProfile(address, { image })
      } catch (e) {
        // A failed read never clears an existing picture (FR-011) — we only report.
        setError(e.message)
      } finally {
        setBusy(false)
      }
    },
    [address],
  )

  return (
    <ActionSheet open={open} onClose={close} title="Customize card" closeDisabled={busy} className="action-sheet--customize">
      <div className="acs-body" data-testid="account-customize">
        <div className="acs-preview" data-tint={tint} data-pattern={pattern}>
          <AccountAvatar address={address} size={56} />
          <div className="acs-preview__text">
            <span className="acs-preview__label">{account?.label}</span>
            <span className="acs-preview__hint">Shown everywhere this account appears — on this device only.</span>
          </div>
        </div>

        <div className="acs-row">
          <span className="acs-row__title" id="acs-picture-title">Picture</span>
          <div className="acs-row__controls" role="group" aria-labelledby="acs-picture-title">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="acs-pick-image">
              {busy ? 'Preparing…' : profile?.image ? 'Replace picture' : 'Choose picture'}
            </button>
            {profile?.image && (
              <button type="button" onClick={() => setAccountProfile(address, { image: null })} disabled={busy}>
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={pickImage}
              className="acs-file"
              aria-label="Choose a profile picture"
              tabIndex={-1}
            />
          </div>
        </div>

        <div className="acs-row">
          <span className="acs-row__title" id="acs-tint-title">Shade</span>
          <div className="acs-swatches" role="radiogroup" aria-labelledby="acs-tint-title">
            {CARD_TINTS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tint === id}
                className="acs-swatch"
                data-tint={id}
                title={TINT_LABEL[id]}
                aria-label={`${TINT_LABEL[id]} shade`}
                onClick={() => setAccountProfile(address, { tint: id })}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        <div className="acs-row">
          <span className="acs-row__title" id="acs-pattern-title">Pattern</span>
          <div className="acs-swatches" role="radiogroup" aria-labelledby="acs-pattern-title">
            {CARD_PATTERNS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={pattern === id}
                className="acs-swatch acs-swatch--pattern"
                data-pattern={id}
                title={PATTERN_LABEL[id]}
                aria-label={`${PATTERN_LABEL[id]} pattern`}
                onClick={() => setAccountProfile(address, { pattern: id })}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="acs-error">
            {error}
          </p>
        )}

        <div className="acs-actions">
          <button
            type="button"
            onClick={() => {
              clearAccountProfile(address)
              setError(null)
            }}
            disabled={busy || !profile}
            data-testid="acs-reset"
          >
            Reset card
          </button>
          <button type="button" className="btn-primary" onClick={close} disabled={busy} data-testid="acs-done">
            Done
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}

AccountCustomizeSheet.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  /** { address, label } — the account whose card is being customized. */
  account: PropTypes.object,
}
