import { useEffect, useRef, useState } from 'react'
import SensitiveValue from '../common/SensitiveValue'
import { fetchCollectibleDetail } from '../../lib/collectibles/gatewayClient'
import './CollectibleDetailSheet.css'

/**
 * CollectibleDetailSheet (spec 055 US2) — read-only bottom sheet for one owned collectible:
 * image, traits, collection floor price, best offer, and the ONLY trading affordance the app
 * offers — a "View on OpenSea" deep link (FR-004/FR-005). Modal scaffolding (Escape + backdrop
 * close, scroll lock, focus save/restore) mirrors AssetDetailSheet per repo convention.
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

        {/* The one and only trading affordance: hand off to the marketplace (FR-004/FR-005). */}
        <a
          className="collectible-sheet-opensea-link"
          href={item.openseaUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on OpenSea ↗
        </a>
        <p className="collectible-sheet-note">
          Buying, selling, and offers happen on OpenSea — this app only displays your collectibles.
        </p>
      </div>
    </div>
  )
}
