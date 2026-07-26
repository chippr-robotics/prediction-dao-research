import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TransferForm from './TransferForm'
import TransferActivityList from './TransferActivityList'
import BridgeView from './BridgeView'
import BridgeStatusList from './BridgeStatusList'
import BridgeUnavailableNotice from './BridgeUnavailableNotice'
import { BRIDGE_UNAVAILABLE_REASON } from '../../hooks/useBridgeAvailability'
import { bridgeGatewayUrl } from '../../lib/bridge/acrossQuotes'
import { BRIDGE_AREA_DESC } from '../../lib/bridge/bridgeCopy'
import './PayTransfer.css'

const TABS = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'bridge', label: 'Bridge' },
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
      <p className="pt-intro">
        Send stablecoins and native tokens to any wallet or ENS name. Stablecoin transfers are gasless where
        the rails are available.
      </p>

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
        <div role="tabpanel" aria-label="Transfer">
          <TransferForm onSent={() => setTab('activity')} />
        </div>
      )}
      {tab === 'bridge' && (
        <div role="tabpanel" aria-label="Bridge">
          <BridgeTab />
        </div>
      )}
      {tab === 'activity' && (
        <div role="tabpanel" aria-label="Activity">
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
      <p className="pt-intro">{BRIDGE_AREA_DESC}</p>
      {gatewayReady ? (
        <BridgeView onRecorded={() => setRecordedAt(Date.now())} />
      ) : (
        <BridgeUnavailableNotice reason={BRIDGE_UNAVAILABLE_REASON.GATEWAY} />
      )}
      <BridgeStatusList refreshKey={recordedAt} />
    </div>
  )
}
