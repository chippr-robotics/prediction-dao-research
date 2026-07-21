# Social & Image — The Unified Activity Ledger

## X (Twitter)

Your dashboard says one P&L, your tax report says another. Both read different sources. We killed the drift with ONE ledger: 5 activity classes, 3 provenance namespaces (oc:/dv:/cl:), a merge where the on-chain row always beats the derived one. 🔗 <link>

#web3 #datamodeling #thegraph

## LinkedIn

An activity feed that grows one feature at a time eventually lies to you. At FairWins we had six read paths each answering "what happened to my money?" — the dashboard derived wager transfers from cached state, the tax report read real subgraph events, transfers lived in a local store. Predictably, the totals drifted, and one path even rendered a payout dated "20645d ago" from a zero timestamp.

Spec 051 replaces all six with a single client-side activity ledger. The new engineering post walks through:

- The canonical LedgerEntry: five activity classes (wager, transfer, earn, pool, membership) normalized into one value object.
- Three identity namespaces — on-chain, derived, client-only — and a merge that applies fixed precedence instead of fragile reconciliation.
- Source adapters that degrade honestly: a failing subgraph marks its class stale, it doesn't blank the feed.
- Invariants that make totals trustworthy: zero timestamps become "date unavailable," failed operations are listed but never totaled, unpriced assets are flagged not zeroed.

No new backend, no subgraph change, no contract change — just one read path the dashboard and the tax report both consume, so they can't disagree.

🔗 <link>

How do you keep a multi-source activity feed from quietly contradicting itself?

#Web3 #DataEngineering #TheGraph #Blockchain #FullStack

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric perspective: five distinct streams of small geometric tokens — each stream a slightly different shape and hue (representing wagers, transfers, pools, earn, memberships) — flowing from separate origins on the left and converging through a precise faceted funnel or merge-junction into a single ordered vertical timeline of uniform stacked cards on the right. Where two streams carry a duplicate token, show one clearly passing through and its twin dissolving into faint particles, conveying deduplication and precedence. Background is deep navy with teal structural lines forming a subtle grid; a single warm amber accent highlights the converged timeline and the merge point. Soft directional lighting from the upper left, gentle depth-of-field, subtle glow on the accent elements, high contrast, minimalist and technical. No text, no logos, no watermarks. Aspect ratio 16:9.
