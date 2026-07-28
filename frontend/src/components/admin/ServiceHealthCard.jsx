import { useGatewayStatus } from '../../hooks/useGatewayStatus'
import { networkName } from '../../lib/chains/estate'

/**
 * ServiceHealthCard — read-only gasless-infrastructure telemetry for the
 * operations control plane (relay-gateway `/status`).
 *
 * Strictly display: the gateway has no remote admin API by design (killswitch
 * and quotas are env/signal-driven — see docs/runbooks/relayer-operations.md).
 *
 * Spec 071 US4 — this card needs no network picker, because it never asked one
 * chain in the first place: there is a single gateway and it reports every
 * chain it serves. Two things about it were dishonest anyway:
 *
 *   - It closed with "network <the build's network>", which reads as the scope
 *     of everything above it. The rows above span chains; naming one of them
 *     invites an operator to read a Polygon outage as a local one.
 *   - It carried its own four-entry chain-name map, so any chain the gateway
 *     added showed up as "Chain 8453". Names come from the network registry.
 */

function fmtRunway(hrs) {
  if (hrs == null) return null
  if (hrs >= 48) return { text: `${Math.round(hrs)}h`, tone: 'active' }
  if (hrs >= 12) return { text: `${Math.round(hrs)}h`, tone: 'warning' }
  return { text: `${Math.max(0, Math.round(hrs))}h`, tone: 'paused' }
}

function ServiceHealthCard() {
  const { configured, loading, reachable, status, lastChecked, refresh } = useGatewayStatus()

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>Gasless Infrastructure</h3>
        <button
          type="button"
          className="refresh-btn"
          onClick={refresh}
          disabled={!configured || loading}
          aria-label="Refresh service health"
        >
          ↻
        </button>
      </div>

      {!configured && (
        <p className="card-info">
          No relay gateway configured (<code>VITE_RELAYER_URL</code> unset). Gasless flows fall
          back to self-submit; nothing to monitor here.
        </p>
      )}

      {configured && (
        <div className="status-details">
          <div className="status-row">
            <span className="status-label">Relay gateway</span>
            <span className={`status-value ${loading ? '' : reachable ? 'active' : 'paused'}`}>
              {loading ? 'Checking…' : reachable ? 'Reachable' : 'Unreachable'}
            </span>
          </div>
          {reachable && status && (
            <div className="status-row">
              <span className="status-label">Kill switch</span>
              <span className={`status-value ${status.killSwitch ? 'paused' : 'active'}`}>
                {status.killSwitch ? 'ACTIVE — relaying halted' : 'Off'}
              </span>
            </div>
          )}
          {reachable && status?.chains.map((c) => {
            const gas = fmtRunway(c.gasWalletRunwayHrs)
            const pm = fmtRunway(c.paymasterDepositRunwayHrs)
            return (
              <div key={c.chainId} className="status-row">
                <span className="status-label">
                  {networkName(c.chainId)} RPC
                </span>
                <span className={`status-value ${c.rpc === 'up' ? 'active' : 'paused'}`}>
                  {c.rpc === 'up' ? 'Up' : 'Down'}
                  {gas && ` · gas ${gas.text}`}
                  {pm && ` · paymaster ${pm.text}`}
                </span>
              </div>
            )
          })}
          {reachable && status && !status.hasOperatorTelemetry && (
            <p className="card-info">
              Runway telemetry (gas wallet / paymaster deposit) is only disclosed to
              origin-authenticated callers; showing the public subset.
            </p>
          )}
          {lastChecked && (
            <p className="card-info">
              Last checked {new Date(lastChecked).toLocaleTimeString()}. One gateway serves every
              network listed above, so this is estate-wide, not your wallet&apos;s network.
              Killswitch and quotas are operated via the runbook
              (docs/runbooks/relayer-operations.md) — the gateway exposes no web admin API by
              design.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ServiceHealthCard
