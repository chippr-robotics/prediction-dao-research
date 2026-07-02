import { useState } from 'react'
import { ethers } from 'ethers'
import { sortParticipants } from '../../lib/pools/participantOrder'

/**
 * PoolParticipants — the pool's single combined roster (spec 034; UX round 3 merges the old
 * "Participants" and "Live standings" sections, which showed the same members twice).
 *
 * Everyone sees the active members as anonymous alias cards (nicknames derive from PUBLIC identity
 * commitments, so nobody is de-anonymized). Before a payout is proposed the creator can drag cards into
 * a rank order; once a payout IS proposed the roster becomes the standings — winner cards grow, carry a
 * 🥇/🥈/🥉 medal, and show their amount — so "the payout is incorporated into the active display".
 *
 * Claim codes never appear here: the payout map is keyed by public commitment, and the actual claim
 * stays code-gated under the hood (the member's device matches its own code at claim time).
 *
 * Props:
 *   participants: [{ commitment, label, suffix }] | null   (null = still loading)
 *   isCreator: boolean
 *   order: string[] | null                                 creator's arranged commitment order
 *   onReorder: (orderedCommitments) => void
 *   payoutByCommitment: Map<string, bigint> | null         amounts once a payout is proposed/locked
 *   tokenSymbol, tokenDecimals                             for formatting amounts
 *   resolved: boolean                                      true once the payout is locked on-chain
 */
export default function PoolParticipants({
  participants,
  isCreator = false,
  order = null,
  onReorder,
  payoutByCommitment = null,
  tokenSymbol = 'USDC',
  tokenDecimals = 6,
  resolved = false,
}) {
  const [dragIndex, setDragIndex] = useState(null)

  if (!participants) return null // still loading — render nothing rather than a false "empty"

  if (participants.length === 0) {
    return (
      <section className="pool-participants" aria-label="Participants" data-testid="pool-participants">
        <h2>Participants (0)</h2>
        <p className="pool-participants-hint" data-testid="participants-empty">
          No one has joined yet — share the pool&apos;s four words so friends can find and join it.
        </p>
      </section>
    )
  }

  const hasPayout = payoutByCommitment && payoutByCommitment.size > 0
  const amountFor = (c) => (hasPayout ? payoutByCommitment.get(String(c)) || 0n : null)
  // Ranking: by payout (desc) once proposed, else the creator's arrangement / alphabetical.
  const sorted = hasPayout
    ? [...participants].sort(
        (a, b) =>
          Number(amountFor(b.commitment) - amountFor(a.commitment)) ||
          a.label.localeCompare(b.label)
      )
    : sortParticipants(participants, order)
  const arranged = Boolean(order && order.length)
  const canReorder = isCreator && !hasPayout // arranging is a pre-resolution tool

  // Medal by winners-in-the-money rank (top three positive amounts).
  const MEDALS = ['🥇', '🥈', '🥉']
  let winnerRank = 0

  const move = (from, to) => {
    if (to < 0 || to >= sorted.length || from === to) return
    const next = sorted.map((p) => p.commitment)
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder?.(next)
  }

  const heading = hasPayout ? (resolved ? 'Final standings' : 'Proposed standings') : 'Participants'
  const hint = hasPayout
    ? resolved
      ? 'The payout is locked on-chain. Winners can claim their share below.'
      : 'Proposed payout — cards in the money are highlighted. Members approve it below to lock it in.'
    : canReorder
      ? 'Drag cards (or use the arrows) to set the rank order. Aliases are anonymous — no wallets or names.'
      : arranged
        ? 'Ranked by the creator. Aliases are anonymous — no wallets or names.'
        : 'Alphabetical until the creator arranges the group. Aliases are anonymous — no wallets or names.'

  return (
    <section className="pool-participants" aria-label="Participants" data-testid="pool-participants">
      <h2>{heading} ({sorted.length})</h2>
      <p className="pool-participants-hint">{hint}</p>
      <ol className="pool-participants-list">
        {sorted.map((p, i) => {
          const amount = amountFor(p.commitment)
          const inMoney = hasPayout && amount > 0n
          const medal = inMoney && winnerRank < MEDALS.length ? MEDALS[winnerRank++] : null
          return (
            <li
              key={p.commitment}
              className={
                `pool-participant-card${dragIndex === i ? ' dragging' : ''}` +
                `${inMoney ? ' in-money' : ''}${hasPayout && !inMoney ? ' no-payout' : ''}`
              }
              data-testid="participant-card"
              draggable={canReorder}
              onDragStart={() => canReorder && setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => canReorder && e.preventDefault()}
              onDrop={() => {
                if (canReorder && dragIndex != null) move(dragIndex, i)
                setDragIndex(null)
              }}
            >
              {(arranged || hasPayout) && (
                <span className="pool-participant-rank" aria-label={`Rank ${i + 1}`}>
                  {medal || i + 1}
                </span>
              )}
              <span className="pool-participant-alias">
                {p.label}
                <span className="pool-participant-suffix" aria-hidden="true">#{p.suffix}</span>
              </span>
              {hasPayout && (
                <span className="pool-participant-payout" data-testid="participant-payout">
                  {inMoney ? `${ethers.formatUnits(amount, tokenDecimals)} ${tokenSymbol}` : 'No payout'}
                </span>
              )}
              {canReorder && (
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
          )
        })}
      </ol>
    </section>
  )
}
