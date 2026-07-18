import { useCallback, useEffect, useRef, useState } from 'react'
import { NETWORKS } from '../../config/networks'
import { fetchOnrampOptions, createOnrampSession } from '../../lib/onramp/onrampClient'
import './BuyCryptoModal.css'

/**
 * BuyCryptoModal (spec 060) — the pre-handoff disclosure for the wallet-sheet Buy button.
 *
 * Everything after "Continue to Coinbase" is Coinbase's own hosted experience (payment, KYC,
 * regional eligibility, delivery); FairWins' entire role is showing the member exactly what is
 * about to happen — asset, network, and the destination address the crypto will be delivered to
 * (FR-003) — then opening the single-use hosted URL minted by the gateway. Honest by design:
 * no synthetic pending/success state (delivery is on Coinbase's timeline, the balance updates
 * from the chain, spec US3), failures render an unavailable message rather than a dead retry
 * loop, and abandoning at any point leaves nothing behind (FR-010).
 *
 * Self-contained overlay dialog per repo convention (Escape + backdrop close, focus managed).
 */
export default function BuyCryptoModal({ isOpen, onClose, address, chainId }) {
  const dialogRef = useRef(null)
  const restoreFocusRef = useRef(null)
  // Availability is keyed by the chain it was fetched for, so a mid-sheet network switch derives
  // back to "loading" for the new chain instead of showing the old chain's catalog.
  const [catalog, setCatalog] = useState(null) // { chainId, opts } | { chainId, error }
  const [asset, setAsset] = useState('')
  const [phase, setPhase] = useState('idle') // idle | minting | opened | error
  const [fallbackUrl, setFallbackUrl] = useState(null) // popup blocked -> visible link (user gesture kept)

  const network = NETWORKS[chainId]
  const options = catalog?.chainId === chainId ? (catalog.opts ?? { error: true }) : null

  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    fetchOnrampOptions(chainId).then(
      (opts) => {
        if (cancelled) return
        setCatalog({ chainId, opts })
        if (opts?.defaultAsset) setAsset(opts.defaultAsset)
      },
      () => {
        if (!cancelled) setCatalog({ chainId, error: true })
      }
    )
    return () => {
      cancelled = true
    }
  }, [isOpen, chainId])

  useEffect(() => {
    if (!isOpen) return undefined
    restoreFocusRef.current = document.activeElement
    dialogRef.current?.focus()
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreFocusRef.current?.focus?.()
    }
  }, [isOpen, onClose])

  const unavailable = options && (options.error || !options.available || (options.assets ?? []).length === 0)

  const handleContinue = useCallback(async () => {
    setPhase('minting')
    setFallbackUrl(null)
    try {
      // Mint against the CURRENT chain/address props — the parent keeps them live, so a network
      // switched mid-sheet is re-validated here (and again gateway-side) before any handoff.
      const { url } = await createOnrampSession({ address, chainId, asset })
      // The session token is single-use with a ~5-minute expiry — open immediately from this
      // user gesture. A popup blocker returns null; keep the URL as a visible link instead.
      const win = window.open(url, '_blank', 'noopener')
      if (!win) setFallbackUrl(url)
      setPhase('opened')
    } catch {
      setPhase('error')
    }
  }, [address, chainId, asset])

  const assetChoices = options?.assets ?? []

  if (!isOpen) return null

  const titleId = 'buy-crypto-title'
  return (
    <div className="buy-crypto-backdrop">
      <button type="button" className="buy-crypto-scrim" aria-label="Close buy crypto" onClick={onClose} />
      <div className="buy-crypto-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="buy-crypto-header">
          <h3 id={titleId}>Buy crypto</h3>
          <button type="button" className="buy-crypto-close" onClick={onClose}>
            Close
          </button>
        </div>

        {!options && <p className="buy-crypto-loading" role="status">Checking availability…</p>}

        {unavailable && (
          <p className="buy-crypto-unavailable" role="status">
            Buying crypto is not available on {network?.name || `chain ${chainId}`} right now.
          </p>
        )}

        {options && !unavailable && phase !== 'opened' && (
          <>
            <dl className="buy-crypto-summary">
              <div className="buy-crypto-row">
                <dt>Asset</dt>
                <dd>
                  {assetChoices.length > 1 ? (
                    <select
                      aria-label="Asset to buy"
                      value={asset}
                      onChange={(e) => setAsset(e.target.value)}
                      disabled={phase === 'minting'}
                    >
                      {assetChoices.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{asset}</span>
                  )}
                </dd>
              </div>
              <div className="buy-crypto-row">
                <dt>Network</dt>
                <dd>{network?.name || `Chain ${chainId}`}</dd>
              </div>
              <div className="buy-crypto-row">
                <dt>Delivered to</dt>
                <dd>
                  <code className="buy-crypto-address">{address}</code>
                </dd>
              </div>
            </dl>

            <p className="buy-crypto-disclosure">
              You&rsquo;ll complete this purchase with Coinbase. Payment, identity checks and fees are
              Coinbase&rsquo;s — FairWins adds no fee and never holds your funds. The crypto is delivered
              by Coinbase directly to your address above.
            </p>

            {phase === 'error' && (
              <p className="buy-crypto-error" role="alert">
                Buying is unavailable right now. Nothing was charged — try again later.
              </p>
            )}

            <div className="buy-crypto-actions">
              <button
                type="button"
                className="buy-crypto-continue"
                onClick={handleContinue}
                disabled={phase === 'minting' || !asset}
              >
                {phase === 'minting' ? 'Preparing…' : 'Continue to Coinbase'}
              </button>
            </div>
          </>
        )}

        {phase === 'opened' && (
          <div className="buy-crypto-opened">
            <p>
              Coinbase opened in a new tab. Delivery happens on Coinbase&rsquo;s timeline — your balance
              here updates once the crypto arrives on-chain.
            </p>
            {fallbackUrl && (
              <p>
                Pop-up blocked?{' '}
                <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                  Open Coinbase to finish your purchase
                </a>
                .
              </p>
            )}
            <div className="buy-crypto-actions">
              <button type="button" className="buy-crypto-continue" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
