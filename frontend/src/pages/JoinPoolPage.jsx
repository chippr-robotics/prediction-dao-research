import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import { getWordListLang } from '../utils/wordListLanguage'
import Button from '../components/ui/Button'
import './pools.css'

/**
 * JoinPoolPage (spec 034) — the four-word group gateway. A participant types the four words, the pool is
 * discovered and its details shown before any funds move (FR-004/FR-005), then they join. Stale/unknown
 * phrases are surfaced honestly, not as a crash (edge cases).
 */
export default function JoinPoolPage() {
  const { isConnected } = useWallet()
  const { resolvePhrase, joinPool, status, error } = usePools()
  const navigate = useNavigate()

  const [phrase, setPhrase] = useState('')
  const [lookup, setLookup] = useState('idle') // idle | searching | found | notfound
  const [summary, setSummary] = useState(null)
  const [notFoundReason, setNotFoundReason] = useState(null)

  const onFind = async (e) => {
    e.preventDefault()
    setLookup('searching')
    setSummary(null)
    setNotFoundReason(null)
    try {
      const res = await resolvePhrase(phrase, getWordListLang())
      if (res.notFound) {
        setLookup('notfound')
        setNotFoundReason(res.reason)
      } else {
        setSummary(res.summary)
        setLookup('found')
      }
    } catch {
      setLookup('notfound')
      setNotFoundReason('error')
    }
  }

  const onJoin = async () => {
    try {
      await joinPool(summary.address)
      navigate(`/pools/${summary.address}`)
    } catch {
      /* error surfaced via hook state */
    }
  }

  const joinable = summary && summary.state === 0 && summary.slotsRemaining > 0

  return (
    <main className="page pool-join-page" aria-labelledby="pool-join-h">
      <h1 id="pool-join-h">Join a group pool</h1>
      <p>Enter the four words the creator shared with you.</p>

      <form onSubmit={onFind} className="pool-join-form">
        <label htmlFor="pool-phrase-input">Four-word phrase</label>
        <input
          id="pool-phrase-input"
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="e.g. crystal orbit harbor violet"
          autoComplete="off"
          required
        />
        <Button type="submit" disabled={status === 'searching'}>Find pool</Button>
      </form>

      {lookup === 'notfound' && (
        <p role="alert" className="pool-notfound">
          {notFoundReason === 'invalid'
            ? 'Those four words aren’t a valid phrase. Check the spelling and word count.'
            : 'No active pool matches that phrase. It may be full, resolved, or mistyped.'}
        </p>
      )}

      {summary && (
        <section className="pool-summary" aria-label="Pool details" data-testid="pool-summary">
          <h2>Pool details</h2>
          <dl>
            <dt>Buy-in</dt>
            <dd>{summary.buyInFormatted} {summary.tokenSymbol}</dd>
            <dt>Members</dt>
            <dd>{summary.memberCount} / {summary.maxMembers} ({summary.slotsRemaining} left)</dd>
            <dt>Status</dt>
            <dd>{summary.stateLabel}</dd>
            <dt>Approval threshold</dt>
            <dd>{summary.thresholdPct}% of members</dd>
          </dl>

          {joinable ? (
            <>
              {error && <p role="alert" className="form-error">{error}</p>}
              <Button onClick={onJoin} disabled={!isConnected || status === 'joining'}>
                {!isConnected ? 'Connect wallet to join' : status === 'joining' ? 'Joining…' : `Join for ${summary.buyInFormatted} ${summary.tokenSymbol}`}
              </Button>
            </>
          ) : (
            <p className="pool-closed-note">
              This pool isn’t accepting new members ({summary.stateLabel === 'JoiningOpen' ? 'full' : summary.stateLabel}).
            </p>
          )}
        </section>
      )}
    </main>
  )
}
