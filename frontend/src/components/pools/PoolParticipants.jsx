import { useState } from 'react'
import { sortParticipants } from '../../lib/pools/participantOrder'

/**
 * PoolParticipants (pool-manager tester feedback, items 3–4).
 *
 * The joined members of a pool as anonymous alias cards. Nicknames derive from PUBLIC identity
 * commitments (Joined events), so every member can render the same list and nobody can be
 * de-anonymized — real names/wallets are never shown.
 *
 * - Everyone sees the active participant list, alphabetical by alias when the creator has not
 *   arranged an order.
 * - The creator can drag cards (or use the accessible up/down buttons) into a rank order, reported
 *   via onReorder(orderedCommitments). The arrangement is device-local until a sync channel ships
 *   (same honest limitation as the interim leaderboard), so other members keep the alphabetical view.
 *
 * Props:
 *   participants: [{ commitment: string, label: string, suffix: string }]
 *   isCreator: boolean — enables reordering
 *   order: string[] | null — creator's arranged commitment order (null = alphabetical)
 *   onReorder: (orderedCommitments: string[]) => void
 */
export default function PoolParticipants({ participants, isCreator = false, order = null, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null)

  if (!participants || participants.length === 0) return null

  const sorted = sortParticipants(participants, order)
  const arranged = Boolean(order && order.length)

  const move = (from, to) => {
    if (to < 0 || to >= sorted.length || from === to) return
    const next = sorted.map((p) => p.commitment)
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder?.(next)
  }

  return (
    <section className="pool-participants" aria-label="Participants" data-testid="pool-participants">
      <h2>Participants ({sorted.length})</h2>
      <p className="pool-participants-hint">
        {isCreator
          ? 'Drag cards (or use the arrows) to set the rank order. Aliases are anonymous — no wallets or names.'
          : arranged
            ? 'Ranked by the creator. Aliases are anonymous — no wallets or names.'
            : 'Alphabetical until the creator arranges the group. Aliases are anonymous — no wallets or names.'}
      </p>
      <ol className="pool-participants-list">
        {sorted.map((p, i) => (
          <li
            key={p.commitment}
            className={`pool-participant-card${dragIndex === i ? ' dragging' : ''}`}
            data-testid="participant-card"
            draggable={isCreator}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => isCreator && e.preventDefault()}
            onDrop={() => {
              if (isCreator && dragIndex != null) move(dragIndex, i)
              setDragIndex(null)
            }}
          >
            {arranged && <span className="pool-participant-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>}
            <span className="pool-participant-alias">
              {p.label}
              <span className="pool-participant-suffix" aria-hidden="true">#{p.suffix}</span>
            </span>
            {isCreator && (
              <span className="pool-participant-controls">
                <button type="button" aria-label={`Move ${p.label} up`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${p.label} down`}
                  onClick={() => move(i, i + 1)}
                  disabled={i === sorted.length - 1}
                >
                  ↓
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
