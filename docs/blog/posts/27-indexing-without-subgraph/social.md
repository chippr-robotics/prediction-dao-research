# Social & Image — Indexing Without a Subgraph

## X (Twitter)

We deployed FairWins to Ethereum Classic and "My Wagers" came back empty — The Graph doesn't index chain 63. Fix: treat the indexer as one swappable source. No subgraph? Read the registry's on-chain pagination views over RPC. eth_call, not eth_getLogs. 🔗 <link>

#TheGraph #web3 #multichain

## LinkedIn

Most multi-chain dApps lean on The Graph for reads — until they deploy to a chain no Graph provider indexes. For us that was Ethereum Classic (chain 63): contracts worked perfectly, but the wager list was empty because there was no indexer to query.

Our new post walks through how FairWins keeps every read path working when the subgraph isn't there:

- Source selection as per-network metadata (`hasSubgraph(chainId)`), not a global flag — a fifth network is a config entry, not a code change.
- A stable repository boundary so the UI is agnostic to whether a page came from The Graph or direct RPC.
- Why we read purpose-built on-chain pagination views (`getUserWagerCount` / `getUserWagerIds` / `getUserWagers`) instead of `eth_getLogs` — public RPCs reject wide log ranges.
- Automatic fallback when a configured indexer errors, and honest degradation for aggregate views that RPC can't cheaply rebuild.

The theme: features should either work, work slower, or say plainly that they can't — and which one happens should be a property of the network config, not a bug.

How do you handle chains your indexing layer doesn't support? 🔗 <link>

#TheGraph #web3 #blockchain #infrastructure #multichain

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style depicting a branching data pipeline: a glowing central conduit splits into two parallel paths that both arrive at the same destination node — one path routed through a stylized indexed-database lattice (ordered, fast, structured), the other a more rugged direct pipe made of stacked hexagonal blockchain segments bypassing the lattice entirely. A small junction switch sits where the split occurs, suggesting per-route selection. Deep navy and teal base palette with a single warm amber accent highlighting the fallback path and the shared endpoint, conveying that both routes reach the same result. Soft volumetric lighting from the upper left, subtle depth of field, precise geometric linework, fintech-engineering mood, uncluttered negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
