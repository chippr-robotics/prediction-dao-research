import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TransferForm from './TransferForm'
import TransferActivityList from './TransferActivityList'
import BridgeView from './BridgeView'
import BridgeStatusList from './BridgeStatusList'
import BridgeUnavailableNotice from './BridgeUnavailableNotice'
import Dashboard from '../fairwins/Dashboard'
import InfoTip from '../ui/InfoTip'
import { BRIDGE_UNAVAILABLE_REASON } from '../../hooks/useBridgeAvailability'
import { bridgeGatewayUrl } from '../../lib/bridge/acrossQuotes'
import { BRIDGE_AREA_DESC, BRIDGE_TIPS } from '../../lib/bridge/bridgeCopy'
import { WAGERS_VIEW, isNavItemEnabledForTenant } from '../../config/appNav'
import './PayTransfer.css'

/*
 * Wagers sits with the two other ways money leaves this section, ahead of Activity — the tabs read
 * actions-then-history, and a wager is an action.
 *
 * It is TENANT-GATED, unlike its neighbours. Transfer and Bridge are core platform surfaces every
 * tenant gets; wagers is an optional manifest feature (spec 072), so on a tenant without it the tab
 * is ABSENT rather than present-and-broken — and because `?view=` only accepts ids that are in this
 * list, a saved `?view=wagers` link for that tenant falls back to Transfer on its own.
 */
const WAGERS_ENABLED = isNavItemEnabledForTenant(WAGERS_VIEW.id)

const TABS = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'bridge', label: 'Bridge' },
  ...(WAGERS_ENABLED ? [{ id: WAGERS_VIEW.view, label: WAGERS_VIEW.label }] : []),
  { id: 'activity', label: 'Activity' },
]

const TAB_IDS = TABS.map((t) => t.id)

/**
 * Transfer — wallet section for sending the active chain's stablecoin (gasless) or native token to
 * any address, plus an Activity log of transfers sent from this device. The tabs mirror the reference
 * "Transfer Money" design (Transfer / Activity).
 *
 * The section is named "Transfer" to members (spec 067 FR-001); its tab id stays `paytransfer` and the
 * component keeps its filename so existing deep links and imports resolve unchanged (FR-002).
 *
 * Spec 067 FR-004 adds a third tab, Bridge, BESIDE Send and Activity — the same-chain send flow is
 * untouched and stays the default tab. The active tab is derived from `?view=` (the EarnPanel idiom)
 * so `/wallet?tab=paytransfer&view=bridge` is a direct link and back/forward keep working.
 *
 * Wagers joined the same row (spec 073): it was its own `/wagers` destination, and it is now the
 * third way money leaves this section — send it, move it across networks, or stake it against a
 * counterparty. `/wagers` redirects here so every saved link keeps working. Transfer is still the
 * default view, so a member who came to send money sees the send form exactly as before.
 */
export default function PayTransferPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('view')
  const tab = TAB_IDS.includes(requested) ? requested : 'transfer'

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'transfer') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="pt-root">
      {/* Each tab states only what applies to it — a same-chain send and a
          cross-network bridge are different operations with different costs,
          and folding them into one blurb either overstates or understates
          each (mirrors TradePanel's per-context subtitle). */}
      {tab === 'transfer' && (
        <p className="pt-intro">
          Send stablecoins and native tokens to any wallet or ENS name. Stablecoin transfers are gasless where
          the rails are available.
        </p>
      )}

      <div className="pt-tabs" role="tablist" aria-label="Transfer sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pt-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'transfer' && (
        <div role="tabpanel" aria-label="Transfer" data-attention="transfer-send">
          <TransferForm onSent={() => setTab('activity')} />
        </div>
      )}
      {tab === 'bridge' && (
        <div role="tabpanel" aria-label="Bridge" data-attention="transfer-bridge">
          <BridgeTab />
        </div>
      )}
      {tab === WAGERS_VIEW.view && WAGERS_ENABLED && (
        /* `pt-wagers` neutralises the page-level chrome Dashboard carries for its old absolute
           route (its own padding + a full-height scroll region) — the same thing HomeScreen.css
           does for the home surface. The component itself is untouched. */
        <div role="tabpanel" aria-label="Wagers" className="pt-wagers" data-attention="transfer-wagers">
          {/* Says the one thing that makes this different from its two neighbours. A send leaves
              the wallet and is gone; a bridge leaves and arrives elsewhere; a wager is ESCROWED and
              comes back — or doesn't — on an outcome. A member who read the Transfer blurb and
              clicked across should not have to infer that. */}
          <p className="pt-intro">
            Stake against someone on an outcome. The stake is held in escrow by the contract until the
            wager resolves — it is not sent to the other party, and an unaccepted or unresolved wager is
            refundable.
          </p>
          <Dashboard />
        </div>
      )}
      {tab === 'activity' && (
        <div role="tabpanel" aria-label="Activity" data-attention="transfer-activity">
          <TransferActivityList />
        </div>
      )}
    </div>
  )
}

/**
 * The Bridge tab (spec 067, US1).
 *
 * ── WHY THIS TAB DOES NOT GATE ON THE WALLET'S ACTIVE CHAIN ──────────────────────────────────
 * It used to. That was wrong, and it broke the premise of the whole surface: a bridge originates
 * on the SOURCE asset's network, not on whichever network the wallet happens to be sitting on, and
 * FR-059/FR-061 exist precisely so a member never has to switch networks to find or select an
 * asset. Gating here meant a member on Ethereum Classic holding USDC on Polygon was told to "pick
 * an asset on one of those networks" with no asset selector rendered to pick from — an instruction
 * that could not be followed inside the surface.
 *
 * So the only thing checked at this level is the one precondition that is genuinely GLOBAL: without
 * a quoting gateway no honest price can be produced for any network (research R10), and a bridge
 * price cannot be derived client-side. Everything else — no protocol on this network, router
 * undeployed, router unreachable, route paused — is a property of the SELECTED SOURCE, and
 * BridgeView resolves and explains each of those per source (FR-051/FR-052).
 *
 * The in-flight list renders UNDERNEATH in every case, including the unavailable ones: a paused
 * route or an unreachable gateway must never hide a transfer that is already moving (FR-053).
 */
function BridgeTab() {
  const gatewayReady = bridgeGatewayUrl() !== ''
  // Bumped when a bridge is recorded, so the in-flight list below reloads immediately. Without it a
  // transfer the member just made is invisible on the very screen that reported it.
  const [recordedAt, setRecordedAt] = useState(0)

  return (
    <div className="bridge-tab">
      <p className="pt-intro">
        {BRIDGE_AREA_DESC}
        <InfoTip label="What is bridging?" className="earn-info">
          {BRIDGE_TIPS.bridge}
        </InfoTip>
      </p>
      {gatewayReady ? (
        <BridgeView onRecorded={() => setRecordedAt(Date.now())} />
      ) : (
        <BridgeUnavailableNotice reason={BRIDGE_UNAVAILABLE_REASON.GATEWAY} />
      )}
      <BridgeStatusList refreshKey={recordedAt} />
    </div>
  )
}
