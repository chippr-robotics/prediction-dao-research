import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import Button from '../components/ui/Button'
import './pools.css'

/**
 * CreatePoolPage (spec 034) — open a group wager pool and get a shareable four-word phrase. The phrase
 * (not a contract address) is what creators share so friends can join (FR-008/FR-003).
 */
export default function CreatePoolPage() {
  const { isConnected } = useWallet()
  const { createPool, status, error } = usePools()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    buyIn: '10',
    maxMembers: '10',
    thresholdPct: '60',
    joinDays: '7',
    resolutionDays: '3',
  })
  const [result, setResult] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setResult(null)
    try {
      const res = await createPool(form)
      setResult(res)
    } catch {
      /* error surfaced via hook state */
    }
  }

  if (result) {
    return (
      <main className="page pool-create-page" aria-labelledby="pool-created-h">
        <h1 id="pool-created-h">Your group pool is live</h1>
        <p>Share these four words so friends can find and join your pool — no address needed:</p>
        <p className="pool-phrase" data-testid="pool-phrase" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
          {result.phrase}
        </p>
        <div className="pool-actions">
          <Button onClick={() => navigate(`/pools/${result.pool}`)}>Open pool</Button>
          <Button variant="secondary" onClick={() => setResult(null)}>Create another</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="page pool-create-page" aria-labelledby="pool-create-h">
      <h1 id="pool-create-h">Create a group pool</h1>
      <p>Set the buy-in and group size. Members resolve the pot together by anonymous vote.</p>

      <form onSubmit={onSubmit} className="pool-create-form">
        <label htmlFor="buyIn">Buy-in (USDC)</label>
        <input id="buyIn" type="number" min="0" step="0.01" value={form.buyIn} onChange={set('buyIn')} required />

        <label htmlFor="maxMembers">Maximum members</label>
        <input id="maxMembers" type="number" min="2" max="1000" value={form.maxMembers} onChange={set('maxMembers')} required />

        <label htmlFor="thresholdPct">Approval threshold (% of members who join)</label>
        <input id="thresholdPct" type="number" min="1" max="100" value={form.thresholdPct} onChange={set('thresholdPct')} required />

        <label htmlFor="joinDays">Join window (days)</label>
        <input id="joinDays" type="number" min="1" value={form.joinDays} onChange={set('joinDays')} required />

        <label htmlFor="resolutionDays">Resolution window (days)</label>
        <input id="resolutionDays" type="number" min="1" value={form.resolutionDays} onChange={set('resolutionDays')} required />

        {error && <p role="alert" className="form-error">{error}</p>}

        <Button type="submit" disabled={!isConnected || status === 'creating'}>
          {!isConnected ? 'Connect wallet to create' : status === 'creating' ? 'Creating…' : 'Create pool'}
        </Button>
      </form>
    </main>
  )
}
