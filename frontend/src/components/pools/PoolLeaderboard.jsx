import { useState } from 'react'

/**
 * PoolLeaderboard (spec 034, US4 / FR-029–031) — live, unresolved standings for tournament/multi-round
 * pools. Players are shown by their anonymous two-word nickname; the creator updates scores and
 * eliminates players. Interim standings are explicitly marked non-final/off-chain (Principle III): they
 * are NOT a settled on-chain outcome. Controlled component — the parent owns `entries` and the handlers.
 *
 * NOTE: real-time sync across members rides an off-chain channel (deferred); until then standings are
 * local to the creator's session, which the non-final marker makes honest.
 */
export default function PoolLeaderboard({
  entries = [],
  isCreator = false,
  isFinal = false,
  onScoreChange,
  onToggleEliminate,
  onAddPlayer,
  onRemovePlayer,
}) {
  const [newName, setNewName] = useState('')
  const editable = isCreator && !isFinal
  const sorted = [...entries].sort((a, b) => Number(b.score) - Number(a.score))

  const submitAdd = (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (name) {
      onAddPlayer?.(name)
      setNewName('')
    }
  }

  return (
    <section className="pool-leaderboard" aria-labelledby="leaderboard-h">
      <h2 id="leaderboard-h">Live standings</h2>

      {!isFinal && (
        <p className="leaderboard-interim" role="note">
          Interim standings — updated off-chain by the creator. Not a final, settled on-chain result.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="leaderboard-empty">No standings yet.</p>
      ) : (
        <ol className="leaderboard-list">
          {sorted.map((e, i) => (
            <li
              key={e.id}
              className={`leaderboard-row${e.eliminated ? ' eliminated' : ''}`}
              data-testid={`lb-row-${e.id}`}
            >
              <span className="lb-rank" aria-hidden="true">{i + 1}</span>
              <span className="lb-nick">
                {e.nickname}
                {e.eliminated && <span className="lb-out"> (out)</span>}
              </span>
              {editable ? (
                <input
                  type="number"
                  className="lb-score-input"
                  aria-label={`Score for ${e.nickname}`}
                  value={e.score}
                  onChange={(ev) => onScoreChange?.(e.id, Number(ev.target.value))}
                />
              ) : (
                <span className="lb-score">{e.score}</span>
              )}
              {editable && (
                <span className="lb-actions">
                  <button type="button" onClick={() => onToggleEliminate?.(e.id)}>
                    {e.eliminated ? 'Revive' : 'Eliminate'}
                  </button>
                  <button type="button" className="danger" onClick={() => onRemovePlayer?.(e.id)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && (
        <form className="leaderboard-add" onSubmit={submitAdd}>
          <label htmlFor="lb-add-player">Add player (nickname)</label>
          <input
            id="lb-add-player"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Prismatic Fox"
            autoComplete="off"
          />
          <button type="submit">Add</button>
        </form>
      )}
    </section>
  )
}
