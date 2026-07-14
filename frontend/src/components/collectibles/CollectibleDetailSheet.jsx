import { useEffect, useRef, useState } from 'react'
import SensitiveValue from '../common/SensitiveValue'
import { useWallet } from '../../hooks/useWalletManagement'
import { fetchCollectibleDetail } from '../../lib/collectibles/gatewayClient'
import { useCollectibleSell } from '../../hooks/useCollectibleSell'
import SellConfirm from './SellConfirm'
import './CollectibleDetailSheet.css'

/**
 * Sell-side actions (spec 056) — List / Accept offer / Cancel for an owned collectible. Read-only
 * details stay in the parent sheet; this adds the write affordances with honest disclosure. When the
 * account type can't sign, it shows an honest reason instead of the buttons (FR-019) — never a dead
 * button. "View on OpenSea" (in the parent) is always the never-stranded fallback (FR-017).
 */
function SellActions({ item, detail }) {
  const { address } = useWallet() || {}
  const sell = useCollectibleSell(item)
  const [mode, setMode] = useState(null) // null | 'sell' | 'accept' | 'cancel'

  const bestOffer = detail?.bestOffer ?? null
  const bestOfferHash = detail?.bestOfferHash ?? null
  const listing = detail?.listing ?? null
  const ownsListing = listing?.orderHash && address && listing.maker?.toLowerCase() === address.toLowerCase()
  const busy = sell.status === 'submitting' || sell.status === 'signing'

  if (!sell.canSell) {
    return (
      <p className="collectible-sheet-sell-unavailable" role="note">
        {sell.unsupportedReason || 'Selling is not available for this account.'}
      </p>
    )
  }

  if (mode === 'sell') return <SellConfirm item={item} onClose={() => setMode(null)} />

  return (
    <div className="collectible-sheet-actions">
      {sell.status === 'done' ? (
        <p className="collectible-sheet-sell-done" role="status">
          {sell.result?.kind === 'listed' && 'Listed — your item is now for sale.'}
          {sell.result?.kind === 'accepted' && 'Offer accepted — the sale is settling on-chain.'}
          {sell.result?.kind === 'cancelled' && 'Listing cancelled.'}
        </p>
      ) : (
        <>
          <div className="collectible-sheet-action-row">
            <button type="button" className="collectible-sheet-sell" onClick={() => setMode('sell')} disabled={busy}>
              Sell
            </button>
            {bestOffer && bestOfferHash && (
              <button type="button" className="collectible-sheet-accept" onClick={() => setMode('accept')} disabled={busy}>
                Accept best offer
              </button>
            )}
            {ownsListing && (
              <button type="button" className="collectible-sheet-cancel-listing" onClick={() => setMode('cancel')} disabled={busy}>
                Cancel listing
              </button>
            )}
          </div>

          {mode === 'accept' && bestOffer && (
            <div className="collectible-sheet-confirm" role="group" aria-label="Confirm accept offer">
              <p>
                Accept the best offer of{' '}
                <strong>
                  {bestOffer.amount} {bestOffer.currency}
                </strong>
                ? The marketplace fee and any creator royalty are deducted, and{' '}
                <strong>accepting is an on-chain transaction — you pay gas.</strong>
              </p>
              <div className="collectible-sheet-confirm-actions">
                <button type="button" onClick={() => setMode(null)} disabled={busy}>
                  Not now
                </button>
                <button type="button" onClick={() => sell.acceptOffer({ orderHash: bestOfferHash })} disabled={busy}>
                  {busy ? 'Accepting…' : 'Accept & pay gas'}
                </button>
              </div>
            </div>
          )}

          {mode === 'cancel' && (
            <div className="collectible-sheet-confirm" role="group" aria-label="Confirm cancel listing">
              <p>Cancel this listing? This is free when the marketplace allows it.</p>
              <div className="collectible-sheet-confirm-actions">
                <button type="button" onClick={() => setMode(null)} disabled={busy}>
                  Keep listing
                </button>
                <button type="button" onClick={() => sell.cancel(listing)} disabled={busy}>
                  {busy ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
              </div>
            </div>
          )}

          {sell.status === 'error' && (
            <p className="collectible-sheet-sell-error" role="alert">
              {sell.reason}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * CollectibleDetailSheet (spec 055 read + spec 056 sell) — bottom sheet for one owned collectible:
 * image, traits, collection floor price, best offer, the sell-side actions (List / Accept / Cancel),
 * and a "View on OpenSea" deep link that is always available (FR-004/FR-017). Modal scaffolding
 * (Escape + backdrop close, scroll lock, focus save/restore) mirrors AssetDetailSheet.
 *
 * Honest state (FR-003/FR-013): missing floor/offer render explicit "none yet"/"unavailable"
 * text — never a zero; stale composed data is labeled with its fetch time.
 */
export default function CollectibleDetailSheet({ item, onClose }) {
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('loading') // loading | ready | degraded
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    if (!item) return undefined
    restoreFocusRef.current = document.activeElement
    sheetRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [item, onClose])

  // The host remounts this sheet per item (key on contract:identifier), so the initial
  // loading state is correct on every open — no state reset needed here.
  useEffect(() => {
    if (!item) return undefined
    let cancelled = false
    fetchCollectibleDetail(item.chainId, item.contract, item.identifier).then(
      (d) => {
        if (cancelled) return
        setDetail(d)
        setDetailState('ready')
      },
      () => {
        if (cancelled) return
        setDetailState('degraded') // grid data still renders; market fields say "unavailable"
      }
    )
    return () => {
      cancelled = true
    }
  }, [item])

  if (!item) return null

  const titleId = 'collectible-sheet-title'
  const imageUrl = detail?.imageUrl ?? item.imageUrl
  const floor = detail?.collection?.floorPrice ?? null
  const bestOffer = detail?.bestOffer ?? null
  const traits = detail?.traits ?? []
  const marketUnavailable = detailState === 'degraded'

  const marketValue = (quote, noneLabel) => {
    if (marketUnavailable) return <span className="collectible-sheet-muted">unavailable right now</span>
    if (detailState === 'loading') return <span className="collectible-sheet-muted">loading…</span>
    if (!quote) return <span className="collectible-sheet-muted">{noneLabel}</span>
    return (
      <SensitiveValue>
        {quote.amount} {quote.currency}
      </SensitiveValue>
    )
  }

  return (
    <div className="collectible-sheet-backdrop">
      <button type="button" className="collectible-sheet-scrim" aria-label="Close collectible details" onClick={onClose} />
      <div
        className="collectible-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="collectible-sheet-grabber" aria-hidden="true" />
        <div className="collectible-sheet-header">
          <div className="collectible-sheet-heading">
            <h3 id={titleId}>{item.name}</h3>
            <p className="collectible-sheet-collection">{detail?.collection?.name ?? item.collectionSlug ?? 'Unknown collection'}</p>
          </div>
          <button type="button" className="collectible-sheet-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="collectible-sheet-media">
          {imageUrl && !imageFailed ? (
            <img src={imageUrl} alt={item.name} loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className="collectible-sheet-media-placeholder" role="img" aria-label={`${item.name} (image unavailable)`}>
              <span aria-hidden="true">🖼</span>
            </div>
          )}
          {item.quantity > 1 && <span className="collectible-sheet-quantity">×{item.quantity} owned</span>}
        </div>

        <dl className="collectible-sheet-market">
          <div>
            <dt>Collection floor</dt>
            <dd>{marketValue(floor, 'no floor price yet')}</dd>
          </div>
          <div>
            <dt>Best offer</dt>
            <dd>{marketValue(bestOffer, 'no offers yet')}</dd>
          </div>
        </dl>
        {detail?.stale && (
          <p className="collectible-sheet-stale" role="status">
            Market data may be out of date (last updated {new Date(detail.fetchedAt).toLocaleString()}).
          </p>
        )}

        {detailState === 'ready' && traits.length > 0 && (
          <div className="collectible-sheet-traits">
            <h4>Traits</h4>
            <ul>
              {traits.map((t) => (
                <li key={`${t.traitType}:${t.value}`}>
                  <span className="collectible-sheet-trait-type">{t.traitType}</span>
                  <span className="collectible-sheet-trait-value">{t.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail?.description && <p className="collectible-sheet-description">{detail.description}</p>}

        {/* Sell-side actions (spec 056) — list, accept an offer, or cancel, with honest disclosure. */}
        <SellActions item={item} detail={detailState === 'ready' ? detail : null} />

        {/* Always-available fallback: act on the marketplace directly (never stranded, FR-017). */}
        <a
          className="collectible-sheet-opensea-link"
          href={item.openseaUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on OpenSea ↗
        </a>
        <p className="collectible-sheet-note">
          Listings and sales settle on OpenSea&apos;s marketplace — your item stays in your wallet
          until it sells.
        </p>
      </div>
    </div>
  )
}
