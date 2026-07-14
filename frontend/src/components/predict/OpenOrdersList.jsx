/**
 * OpenOrdersList (spec 057 US3) — the connected wallet's open (unfilled) CLOB orders, each cancellable
 * via a gas-free cancel through usePredictTrade. On cancel the list refreshes.
 */
import { usePredictOpenOrders } from '../../hooks/usePredictPortfolio'
import { usePredictTrade } from '../../hooks/usePredictTrade'
import './OpenOrdersList.css'

export default function OpenOrdersList() {
  const { status, orders, refresh } = usePredictOpenOrders()
  const trade = usePredictTrade()
  const busy = trade.status === 'submitting'

  // Hidden entirely when unsupported/disconnected — the parent panel handles those states.
  if (status === 'unsupported' || status === 'disconnected') return null
  // Nothing to show for the empty/loading-with-no-orders case keeps the panel quiet.
  if (status === 'empty' || status === 'loading') return null

  const onCancel = async (order) => {
    const res = await trade.cancel(order)
    if (res) refresh()
  }

  return (
    <section className="predict-orders" aria-label="Open orders">
      <div className="predict-orders-header">
        <h4>Open orders</h4>
        <button type="button" className="predict-orders-refresh" onClick={refresh}>
          Refresh
        </button>
      </div>

      {status === 'degraded' ? (
        <p className="predict-orders-status" role="status">
          Order data is temporarily unavailable.
        </p>
      ) : (
        <ul className="predict-orders-list">
          {orders.map((o) => (
            <li key={o.orderId} className="predict-order">
              <span className="predict-order-side" data-side={o.side}>
                {o.side}
              </span>
              <span className="predict-order-detail">
                {o.remaining}/{o.size} @ {o.price ?? '—'}
              </span>
              <button type="button" className="predict-order-cancel" disabled={busy} onClick={() => onCancel(o)}>
                {busy ? 'Cancelling…' : 'Cancel'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {trade.status === 'error' && (
        <p className="predict-orders-status" role="alert">
          {trade.reason}
        </p>
      )}
    </section>
  )
}
