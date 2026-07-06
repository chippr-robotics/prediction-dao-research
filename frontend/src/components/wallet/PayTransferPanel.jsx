import { useState } from 'react'
import TransferForm from './TransferForm'
import TransferActivityList from './TransferActivityList'
import './PayTransfer.css'

const TABS = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'activity', label: 'Activity' },
]

/**
 * Pay & Transfer — wallet section for sending the active chain's stablecoin (gasless) or native token to
 * any address, plus an Activity log of transfers sent from this device. Two tabs mirror the reference
 * "Transfer Money" design (Transfer / Activity).
 */
export default function PayTransferPanel() {
  const [tab, setTab] = useState('transfer')

  return (
    <div className="pt-root">
      <p className="pt-intro">
        Send stablecoins and native tokens to any wallet or ENS name. Stablecoin transfers are gasless where
        the rails are available.
      </p>

      <div className="pt-tabs" role="tablist" aria-label="Pay & Transfer">
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
      {tab === 'activity' && (
        <div role="tabpanel" aria-label="Activity">
          <TransferActivityList />
        </div>
      )}
    </div>
  )
}
