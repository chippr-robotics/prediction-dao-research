import { useCallback, useEffect, useRef, useState } from 'react'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import NavIcon from '../nav/NavIcon'
import LegacyUnlockDialog from './LegacyUnlockDialog'
import { useAccountSwitcher, ACCOUNT_KIND_TAG, shortAccountAddr } from '../../hooks/useAccountSwitcher'
import { NETWORKS } from '../../config/networks'
import './AccountCardsCarousel.css'

/**
 * AccountCardsCarousel — the top half of the unified My Account view: one card
 * per account the member can act as (personal wallet, multisig vaults,
 * recovered legacy accounts), swipeable left/right. Selecting a card makes that
 * account the ACTIVE account app-wide — it drives the same CustodyContext seam
 * as the header dropdown's switcher (useAccountSwitcher.choose), so the two
 * surfaces can never disagree about which account is active.
 *
 * Recovered (legacy) accounts unlock first: choose() opens the unlock dialog,
 * and only a successful unlock switches (spec 062 — the encrypted key never
 * activates silently).
 *
 * Scrolling is native horizontal scroll with CSS scroll-snap; the arrows and
 * dots are conveniences layered on top (and the arrows are the keyboard/desktop
 * affordance). No swipe library — cards are plain snap targets.
 */

// Chain identity for vault cards. Strict lookup — an unknown id renders as
// "Chain <id>" rather than mislabeling the vault with the default network.
function chainLabel(chainId) {
  if (chainId == null) return null
  return NETWORKS[chainId]?.name || `Chain ${chainId}`
}

const KIND_LABEL = { personal: 'Personal', vault: 'Multisig', legacy: 'Recovered' }

function AccountCardsCarousel() {
  const { accounts, currentId, choose, unlockEntry, setUnlockEntry, onUnlocked } = useAccountSwitcher()
  const trackRef = useRef(null)
  const [scrollIndex, setScrollIndex] = useState(0)

  // The card whose center is nearest the viewport center — drives the dots and
  // the arrows' disabled states. Recomputed on scroll (rAF-throttled).
  const measureScrollIndex = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let nearestDist = Infinity
    Array.from(track.children).forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2
      const dist = Math.abs(childCenter - center)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    })
    setScrollIndex(nearest)
  }, [])

  const rafRef = useRef(0)
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(measureScrollIndex)
  }, [measureScrollIndex])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current
    const child = track?.children?.[index]
    if (!track || !child) return
    const left = Math.max(0, child.offsetLeft - (track.clientWidth - child.offsetWidth) / 2)
    setScrollIndex(index)
    if (Math.abs(track.scrollLeft - left) < 1) return // already in position
    if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: 'smooth' })
    else track.scrollLeft = left
  }, [])

  // Bring the active account's card into view when the selection changes
  // (including a switch made from the header dropdown).
  const activeIndex = accounts.findIndex((acc) => acc.id === currentId)
  useEffect(() => {
    if (activeIndex >= 0) scrollToIndex(activeIndex)
    // scroll only on selection change, not on every list identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  const handleSelect = (acc, index) => {
    scrollToIndex(index)
    if (acc.id !== currentId) choose(acc)
  }

  const showControls = accounts.length > 1

  return (
    <section className="account-cards" aria-label="Your accounts">
      <div className="account-cards-viewport">
        {/* The card button IS the option — no interactive wrapper, so the
            listbox has no nested-interactive elements (axe gate X1). */}
        <div
          className="account-cards-track"
          role="listbox"
          aria-label="Select the active account"
          aria-orientation="horizontal"
          ref={trackRef}
          onScroll={handleScroll}
        >
          {accounts.map((acc, index) => {
            const isActive = acc.id === currentId
            const network = acc.kind === 'vault' ? chainLabel(acc.chainId) : null
            return (
              <button
                key={acc.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`account-card account-card--${acc.kind} ${isActive ? 'is-active' : ''}`}
                onClick={() => handleSelect(acc, index)}
              >
                <span className="account-card-top">
                  <BlockiesAvatar address={acc.address} size={36} />
                  <span className="account-card-kind">{KIND_LABEL[acc.kind] || acc.kind}</span>
                </span>
                <span className="account-card-label">{acc.label || shortAccountAddr(acc.address)}</span>
                <span className="account-card-bottom">
                  <span className="account-card-address">{shortAccountAddr(acc.address)}</span>
                  {network && <span className="account-card-network">{network}</span>}
                </span>
                <span className={`account-card-state ${isActive ? 'is-active' : ''}`}>
                  {isActive ? (
                    <>
                      <NavIcon name="check" size={12} /> Active
                    </>
                  ) : (
                    'Tap to use'
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {showControls && (
          <>
            <button
              type="button"
              className="account-cards-arrow account-cards-arrow--prev"
              onClick={() => scrollToIndex(Math.max(0, scrollIndex - 1))}
              disabled={scrollIndex <= 0}
              aria-label="Previous account"
            >
              ‹
            </button>
            <button
              type="button"
              className="account-cards-arrow account-cards-arrow--next"
              onClick={() => scrollToIndex(Math.min(accounts.length - 1, scrollIndex + 1))}
              disabled={scrollIndex >= accounts.length - 1}
              aria-label="Next account"
            >
              ›
            </button>
          </>
        )}
      </div>

      {showControls && (
        <div className="account-cards-dots">
          {accounts.map((acc, index) => (
            <button
              key={acc.id}
              type="button"
              className={`account-cards-dot ${index === scrollIndex ? 'is-current' : ''}`}
              aria-label={`Go to ${acc.label || shortAccountAddr(acc.address)}${ACCOUNT_KIND_TAG[acc.kind] ? ` (${ACCOUNT_KIND_TAG[acc.kind]})` : ''}`}
              aria-current={index === scrollIndex ? 'true' : undefined}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      )}

      {/* Recovered accounts unlock before activating (spec 062). */}
      <LegacyUnlockDialog
        open={Boolean(unlockEntry)}
        entry={unlockEntry}
        onClose={() => setUnlockEntry(null)}
        onUnlocked={onUnlocked}
      />
    </section>
  )
}

export default AccountCardsCarousel
