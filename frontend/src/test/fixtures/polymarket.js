// Canned Gamma API payloads for Polymarket search/filter tests.
// Shapes mirror the live API (verified 2026-06-13): /public-search returns
// { events: [...] }; /events returns an array of events; each event has `tags`
// and nested `markets`.

const mkMarket = (over = {}) => ({
  id: over.id ?? '0',
  question: over.question ?? 'Will it happen?',
  conditionId: 'conditionId' in over ? over.conditionId : '0xcond0',
  slug: over.slug ?? 'market-slug',
  endDate: over.endDate ?? '2026-12-31T00:00:00Z',
  volume: over.volume ?? 1000,
  active: over.active ?? true,
  closed: over.closed ?? false,
  groupItemTitle: over.groupItemTitle,
  outcomes: over.outcomes ?? JSON.stringify(['Yes', 'No']),
  outcomePrices: over.outcomePrices ?? JSON.stringify(['0.5', '0.5']),
})

const mkEvent = (over = {}) => ({
  id: over.id ?? 'ev0',
  title: over.title ?? 'An Event',
  slug: over.slug ?? 'an-event',
  volume: over.volume ?? 1000,
  tags: over.tags ?? [],
  markets: over.markets ?? [mkMarket()],
})

// --- Search ("knicks") -------------------------------------------------------
// A single game exposing many sub-markets (the grouping case), tagged Sports.
export const knicksGameEvent = mkEvent({
  id: 'ev-knicks-game',
  title: 'Pacers vs. Knicks',
  slug: 'nba-ind-nyk-2025-05-21',
  volume: 500000,
  tags: [{ id: '1', label: 'Sports', slug: 'sports' }],
  markets: [
    mkMarket({ id: 'k1', question: 'Pacers vs. Knicks', conditionId: '0xk1', groupItemTitle: 'Moneyline', volume: 300000 }),
    mkMarket({ id: 'k2', question: 'Spread: Knicks (-4.5)', conditionId: '0xk2', groupItemTitle: 'Knicks -4.5', volume: 90000 }),
    mkMarket({ id: 'k3', question: 'Pacers vs Knicks: O/U 224.5', conditionId: '0xk3', groupItemTitle: 'O/U 224.5', volume: 60000 }),
  ],
})

// A single-market crypto event (selects directly, no expand).
export const knicksSingleEvent = mkEvent({
  id: 'ev-knicks-single',
  title: 'Knicks to win the title?',
  slug: 'knicks-title',
  volume: 120000,
  tags: [{ id: '1', label: 'Sports', slug: 'sports' }],
  markets: [mkMarket({ id: 'kt', question: 'Will the Knicks win the championship?', conditionId: '0xkt', volume: 120000 })],
})

export const searchKnicksPayload = {
  events: [knicksGameEvent, knicksSingleEvent],
  pagination: { hasMore: false },
}

// A query whose only matches are ineligible (all markets closed / no conditionId).
export const searchIneligiblePayload = {
  events: [
    mkEvent({
      id: 'ev-ineligible',
      title: 'Resolved thing',
      tags: [{ id: '1', label: 'Sports', slug: 'sports' }],
      markets: [
        mkMarket({ id: 'x1', conditionId: '0xclosed', closed: true }),
        mkMarket({ id: 'x2', conditionId: null }),
      ],
    }),
  ],
  pagination: { hasMore: false },
}

// --- Browse (/events) --------------------------------------------------------
// Single-market events render the market question (not the event title), so the
// markets carry the distinctive text the tests assert on.
export const topEventsDefault = [
  mkEvent({ id: 'ev-top1', title: 'Top Politics Event', volume: 9000000, tags: [{ id: '2', label: 'Politics', slug: 'politics' }], markets: [mkMarket({ id: 'p1', question: 'Will the incumbent be re-elected?', conditionId: '0xp1', volume: 9000000 })] }),
  mkEvent({ id: 'ev-top2', title: 'Top Crypto Event', volume: 8000000, tags: [{ id: '21', label: 'Crypto', slug: 'crypto' }], markets: [mkMarket({ id: 'e1', question: 'Will ETH flip BTC?', conditionId: '0xe1', volume: 8000000 })] }),
]

export const sportsEvents = [
  mkEvent({ id: 'ev-sport1', title: 'World Cup Winner', volume: 2000000, tags: [{ id: '1', label: 'Sports', slug: 'sports' }], markets: [
    mkMarket({ id: 's1', question: 'Will Spain win?', conditionId: '0xs1', groupItemTitle: 'Spain', volume: 900000 }),
    mkMarket({ id: 's2', question: 'Will Brazil win?', conditionId: '0xs2', groupItemTitle: 'Brazil', volume: 800000 }),
  ] }),
]

export const cryptoEvents = [
  mkEvent({ id: 'ev-crypto1', title: 'BTC above 100k?', volume: 1500000, tags: [{ id: '21', label: 'Crypto', slug: 'crypto' }], markets: [
    mkMarket({ id: 'c1', question: 'Will BTC be above $100k?', conditionId: '0xc1', volume: 1500000 }),
  ] }),
]

export { mkEvent, mkMarket }
