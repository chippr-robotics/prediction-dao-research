/**
 * SellConfirm (spec 056 US1) — the honest confirmation surface for listing an owned collectible.
 *
 * Shows the live fee breakdown and the resulting NET PROCEEDS before any signature (FR-002/FR-010),
 * warns below the fee floor (FR-011), discloses the FairWins referral reward and that it costs the
 * seller nothing (FR-014/FR-015 — no surcharge line exists), and never lets the user sign when fees
 * couldn't be confirmed (FR-009). Modal scaffolding mirrors CollectibleDetailSheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollectibleSell } from '../../hooks/useCollectibleSell'
import './SellConfirm.css'

// Listing currency options per chain. Native only in this cut (18 decimals, no token address needed);
// extend here to add WETH/USDC once payment-token selection is wired to OpenSea's accepted currencies.
function currencyOptions(chainId) {
  const native = chainId === 1 ? 'ETH' : 'POL'
  return [{ currency: native, decimals: 18, native: true }]
}

export default function SellConfirm({ item, onClose }) {
  const sell = useCollectibleSell(item)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(() => currencyOptions(item?.chainId)[0])
  const dialogRef = useRef(null)

  useEffect(() => {
    sell.loadFees()
    dialogRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const price = useMemo(
    () => ({ amount: amount || '0', currency: currency.currency, decimals: currency.decimals, native: currency.native }),
    [amount, currency]
  )
  const quote = useMemo(() => (sell.status === 'ready' ? sell.preview(price) : null), [sell, price])

  const priceValid = Number(amount) > 0
  const canSign = sell.status === 'ready' && priceValid && quote && !quote.belowFloor
  const busy = sell.status === 'signing' || sell.status === 'submitting'

  const titleId = 'sell-confirm-title'
  return (
    <div className="sell-confirm-backdrop">
      <button type="button" className="sell-confirm-scrim" aria-label="Close" onClick={onClose} />
      <div className="sell-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="sell-confirm-header">
          <h3 id={titleId}>List {item?.name} for sale</h3>
          <button type="button" className="sell-confirm-close" onClick={onClose}>
            Close
          </button>
        </div>

        {sell.status === 'checking' && (
          <p className="sell-confirm-status" role="status">
            Confirming the current marketplace fees…
          </p>
        )}

        {sell.status === 'blocked' && (
          <div className="sell-confirm-blocked" role="alert">
            <p>{sell.reason}</p>
            {sell.canSell && (
              <button type="button" onClick={() => sell.loadFees()}>
                Try again
              </button>
            )}
          </div>
        )}

        {(sell.status === 'ready' || busy) && (
          <>
            <label className="sell-confirm-field">
              <span>Price</span>
              <span className="sell-confirm-price-row">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Listing price"
                  disabled={busy}
                />
                <select
                  aria-label="Currency"
                  value={currency.currency}
                  onChange={(e) =>
                    setCurrency(currencyOptions(item?.chainId).find((c) => c.currency === e.target.value))
                  }
                  disabled={busy}
                >
                  {currencyOptions(item?.chainId).map((c) => (
                    <option key={c.currency} value={c.currency}>
                      {c.currency}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            {quote && (
              <dl className="sell-confirm-breakdown">
                {quote.feeLines.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>
                      −{f.amount} {f.currency}
                    </dd>
                  </div>
                ))}
                <div className="sell-confirm-net">
                  <dt>You receive</dt>
                  <dd data-testid="sell-net">
                    {quote.net} {quote.currency}
                  </dd>
                </div>
              </dl>
            )}

            {quote?.belowFloor && priceValid && (
              <p className="sell-confirm-warn" role="alert">
                That price would leave you nothing after fees. Raise it above the fee total.
              </p>
            )}

            <p className="sell-confirm-reward">
              FairWins may earn a referral reward from the marketplace on this sale — it costs you
              nothing and doesn&apos;t change what you receive.
            </p>

            <div className="sell-confirm-actions">
              <button type="button" className="sell-confirm-cancel" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="sell-confirm-submit"
                disabled={!canSign || busy}
                onClick={() => sell.submitListing(price)}
              >
                {busy ? 'Listing…' : 'Sign listing (no gas)'}
              </button>
            </div>
          </>
        )}

        {sell.status === 'done' && (
          <p className="sell-confirm-done" role="status">
            Listed. Your item is now for sale — it stays in your wallet until it sells.
          </p>
        )}

        {sell.status === 'error' && (
          <div className="sell-confirm-error" role="alert">
            <p>{sell.reason}</p>
            {item?.openseaUrl && (
              <a href={item.openseaUrl} target="_blank" rel="noopener noreferrer">
                List on OpenSea instead ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
