import { useMemo, useState } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { useCollectibles } from '../../hooks/useCollectibles'
import EmptyState from '../account/EmptyState'
import CollectibleDetailSheet from './CollectibleDetailSheet'
import './CollectiblesPanel.css'

const OPENSEA_EXPLORE_URL = 'https://opensea.io'

function CollectibleCard({ item, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <li className="collectible-card">
      <button
        type="button"
        className="collectible-card-button"
        onClick={() => onOpen(item)}
        aria-haspopup="dialog"
        aria-label={`${item.name}, ${item.collectionSlug || 'unknown collection'}`}
      >
        <span className="collectible-card-media">
          {item.imageUrl && !imageFailed ? (
            <img src={item.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <span className="collectible-card-placeholder" aria-hidden="true">
              🖼
            </span>
          )}
          {item.quantity > 1 && <span className="collectible-card-quantity">×{item.quantity}</span>}
        </span>
        <span className="collectible-card-name">{item.name}</span>
        <span className="collectible-card-collection">{item.collectionSlug || '—'}</span>
      </button>
    </li>
  )
}

/**
 * CollectiblesPanel (spec 055 US1) — the Finance → Collectibles tab: a read-only grid of the
 * connected wallet's NFTs on the active network (Ethereum/Polygon via the gateway proxy).
 *
 * Soft-fail + honest state: hidden entirely on unsupported networks (the tab never renders this
 * panel there, FR-007); degraded upstream shows an explicit unavailable state with the OpenSea
 * link still offered (FR-008); stale cached data is labeled (FR-013); provider-flagged items sit
 * behind an off-by-default toggle (FR-012). Sell-side actions live in the item detail sheet (spec 056).
 */
export default function CollectiblesPanel() {
  const { isConnected, openConnectModal } = useWallet() || {}
  const { status, items, hasMore, loadMore, loadingMore, stale, fetchedAt, refresh } = useCollectibles()
  const [showFlagged, setShowFlagged] = useState(false)
  const [openItem, setOpenItem] = useState(null)

  const { visible, flaggedCount } = useMemo(() => {
    const flagged = items.filter((i) => i.isFlagged)
    return { visible: showFlagged ? items : items.filter((i) => !i.isFlagged), flaggedCount: flagged.length }
  }, [items, showFlagged])

  return (
    <section className="collectibles-panel" aria-label="Collect">
      <div className="collectibles-panel-header">
        <div>
          <h3>Collect</h3>
          <p className="collectibles-panel-subtitle">
            Digital collectibles owned by your connected wallet on this network. Open one to list it for sale,
            accept an offer, or view it on OpenSea.
          </p>
        </div>
        {status === 'ready' || status === 'empty' ? (
          <button type="button" className="collectibles-refresh" onClick={refresh}>
            Refresh
          </button>
        ) : null}
      </div>

      {stale && (
        <p className="collectibles-stale-banner" role="status">
          Showing cached data{fetchedAt ? ` from ${new Date(fetchedAt).toLocaleString()}` : ''} — the marketplace data
          source is temporarily unreachable.
        </p>
      )}

      {!isConnected || status === 'disconnected' ? (
        <EmptyState
          title="Connect your wallet"
          message="Connect a wallet to see the digital collectibles it owns on this network."
          ctaLabel="Connect"
          onCta={openConnectModal}
        />
      ) : status === 'loading' ? (
        <p className="collectibles-loading" role="status">
          Loading your collectibles…
        </p>
      ) : status === 'degraded' ? (
        <div className="collectibles-degraded" role="status">
          <p>Collectible data is temporarily unavailable. Your items are safe on-chain — this only affects display.</p>
          <div className="collectibles-degraded-actions">
            <button type="button" onClick={refresh}>
              Try again
            </button>
            <a href={OPENSEA_EXPLORE_URL} target="_blank" rel="noopener noreferrer">
              Open OpenSea ↗
            </a>
          </div>
        </div>
      ) : visible.length === 0 && flaggedCount === 0 ? (
        <EmptyState
          title="No collectibles here yet"
          message="This wallet doesn't own any collectibles on this network. Explore collections on OpenSea — anything you collect will show up here."
          ctaLabel="Explore OpenSea"
          onCta={() => window.open(OPENSEA_EXPLORE_URL, '_blank', 'noopener,noreferrer')}
        />
      ) : (
        <>
          <ul className="collectibles-grid">
            {visible.map((item) => (
              <CollectibleCard key={`${item.contract}:${item.identifier}`} item={item} onOpen={setOpenItem} />
            ))}
          </ul>
          {flaggedCount > 0 && (
            <label className="collectibles-flagged-toggle">
              <input type="checkbox" checked={showFlagged} onChange={(e) => setShowFlagged(e.target.checked)} />
              Show {flaggedCount} item{flaggedCount === 1 ? '' : 's'} flagged as spam or sensitive by the marketplace
            </label>
          )}
          {hasMore && (
            <button type="button" className="collectibles-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      <CollectibleDetailSheet
        key={openItem ? `${openItem.contract}:${openItem.identifier}` : 'closed'}
        item={openItem}
        onClose={() => setOpenItem(null)}
      />
    </section>
  )
}
