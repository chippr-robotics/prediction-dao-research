import { useCallback, useEffect, useRef, useState } from 'react'
import NavIcon from '../nav/NavIcon'
import LegacyUnlockDialog from './LegacyUnlockDialog'
import HardwareConnectDialog from './HardwareConnectDialog'
import AccountCard from './AccountCard'
import AccountCustomizeSheet from './AccountCustomizeSheet'
import SensitiveValue from '../common/SensitiveValue'
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

// Full-precision USD, matching the Portfolio view's own total formatting.
function formatUsdFull(n) {
  return `$${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * @param {number|null} activeTotalUsd — the ACTIVE account's portfolio total,
 * shown on its card for quick access. Null hides the line (still loading /
 * unavailable) — a card must never show a fabricated $0 while data loads.
 */
function AccountCardsCarousel({ activeTotalUsd = null }) {
  const { accounts, currentId, choose, unlockEntry, setUnlockEntry, onUnlocked, hardwareEntry, setHardwareEntry, onHardwareConnected } = useAccountSwitcher()
  const trackRef = useRef(null)
  const [scrollIndex, setScrollIndex] = useState(0)
  // Spec 086 — the Customize sheet edits the ACTIVE account's card (one editing surface,
  // reachable right where the card is).
  const [customizeOpen, setCustomizeOpen] = useState(false)

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
  const activeAccount = accounts.find((acc) => acc.id === currentId) || null

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
            return (
              <AccountCard
                key={acc.id}
                account={acc}
                active={isActive}
                network={acc.kind === 'vault' ? chainLabel(acc.chainId) : null}
                balance={
                  isActive && activeTotalUsd != null ? (
                    <span className="account-card-balance">
                      <span className="account-card-balance-label">Total balance</span>
                      <SensitiveValue className="account-card-balance-value">
                        {formatUsdFull(activeTotalUsd)}
                      </SensitiveValue>
                    </span>
                  ) : null
                }
                onSelect={() => handleSelect(acc, index)}
              />
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

      {/* Spec 086 — customize the active account's card (picture, shade, pattern). */}
      {activeAccount && (
        <button
          type="button"
          className="account-cards-customize"
          onClick={() => setCustomizeOpen(true)}
          data-testid="account-customize-open"
        >
          <NavIcon name="sliders" size={14} /> Customize card
        </button>
      )}

      <AccountCustomizeSheet
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        account={activeAccount}
      />

      {/* Recovered accounts unlock before activating (spec 062). */}
      <LegacyUnlockDialog
        open={Boolean(unlockEntry)}
        entry={unlockEntry}
        onClose={() => setUnlockEntry(null)}
        onUnlocked={onUnlocked}
      />

      {/* Hardware accounts reconnect their device before activating (spec 085). */}
      <HardwareConnectDialog
        open={Boolean(hardwareEntry)}
        entry={hardwareEntry}
        onClose={() => setHardwareEntry(null)}
        onConnected={onHardwareConnected}
      />
    </section>
  )
}

export default AccountCardsCarousel
