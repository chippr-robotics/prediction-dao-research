/**
 * Spec 071 FR-011 / FR-012 — the estate sweep's three states, at the point they are decided.
 *
 * `adminEstateEntry.test.jsx` asserts what each state LOOKS like by handing the Control Room an
 * `estateRead` directly. This file asserts the thing that produces it, because that is where the
 * defect was: a chain with no operator contracts was classified `read`.
 *
 * Why that matters, concretely. On a mainnet build only Polygon carries a contract for every
 * operator role; Ethereum, Optimism, Base and Arbitrum carry the two spec-067 routers and nothing
 * else, and Ethereum Classic carries neither. During a TOTAL RPC outage the old rule therefore
 * produced `read = [1, 10, 61, 8453, 42161]` — five chains that had "answered" from the address
 * book without a single successful call — `unreadable = [137]`, and an entry state of `denied`.
 * The operator saw "Access Restricted": a statement about their permissions, made on the strength
 * of no reads at all. That is exactly the sentence FR-012 exists to prevent.
 */
import { describe, it, expect } from 'vitest'
import { classifyEstateProbes } from '../../lib/chains/estateSweep'

/** One probe per (role, chain). `deployed: false` ⇒ nothing on that chain could hold the role. */
const probe = (chainId, { deployed = true, readable = true } = {}) => ({ chainId, deployed, readable })

describe('classifyEstateProbes (spec 071 FR-011)', () => {
  it('reports a chain that answered as read', () => {
    const out = classifyEstateProbes([probe(137), probe(137, { deployed: false })], [137])
    expect(out).toEqual({ read: [137], notDeployed: [], unreadable: [] })
  })

  it('reports a chain with no operator contracts as not-deployed, never as read', () => {
    const out = classifyEstateProbes([probe(61, { deployed: false }), probe(61, { deployed: false })], [61])
    expect(out.notDeployed).toEqual([61])
    expect(out.read).toEqual([])
  })

  it('reports a chain whose every contract refused as unreadable', () => {
    const out = classifyEstateProbes(
      [probe(137, { readable: false }), probe(137, { readable: false })],
      [137],
    )
    expect(out.unreadable).toEqual([137])
    expect(out.read).toEqual([])
  })

  it('counts a chain as read when even one contract answered — a missing contract is not an outage', () => {
    const out = classifyEstateProbes([probe(1, { readable: false }), probe(1)], [1])
    expect(out.read).toEqual([1])
    expect(out.unreadable).toEqual([])
  })

  it('ignores config-settled probes when deciding whether a chain answered', () => {
    // Ethereum during an outage: the routers would not answer; the four roles with no contract
    // there settled from config. The chain read nothing, so it is unreadable.
    const out = classifyEstateProbes(
      [
        probe(1, { readable: false }), // ADMIN — bridgeRouter
        probe(1, { readable: false }), // GUARDIAN — bridgeRouter
        probe(1, { deployed: false }), // ACCOUNT_MODERATOR — no WagerRegistry on Ethereum
        probe(1, { deployed: false }), // ROLE_MANAGER — no MembershipManager on Ethereum
      ],
      [1],
    )
    expect(out.unreadable).toEqual([1])
    expect(out.read).toEqual([])
  })

  it('leaves NOTHING in read during a total outage — the case that produced a false denial', () => {
    const cohort = [137, 1, 10, 61, 8453, 42161]
    const probes = [
      ...[137, 1, 10, 8453, 42161].flatMap((id) => [
        probe(id, { readable: false }),
        probe(id, { deployed: false }),
      ]),
      probe(61, { deployed: false }),
    ]

    const out = classifyEstateProbes(probes, cohort)

    expect(out.read).toEqual([])
    expect(out.unreadable).toEqual([137, 1, 10, 8453, 42161])
    expect(out.notDeployed).toEqual([61])
  })

  it('preserves the caller’s chain order and partitions the cohort exactly once', () => {
    const cohort = [137, 1, 61]
    const out = classifyEstateProbes(
      [probe(137), probe(1, { readable: false }), probe(61, { deployed: false })],
      cohort,
    )
    expect([...out.read, ...out.unreadable, ...out.notDeployed].sort()).toEqual([...cohort].sort())
  })

  it('classifies a chain with no probes at all as not-deployed, not as read', () => {
    expect(classifyEstateProbes([], [42161])).toEqual({
      read: [],
      notDeployed: [42161],
      unreadable: [],
    })
  })
})
