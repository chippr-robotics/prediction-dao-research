# Social & Image — Indexing Without a Subgraph

## X (Twitter)

We deployed FairWins to Ethereum Classic and "My Wagers" came back empty — The Graph doesn't index that chain, so there was no search index to query. Fix: treat the index as one swappable data source. No index? Read the blockchain directly, using a per-user index baked into the contract instead of a slow log scan. 🔗 <link>

#TheGraph #web3 #multichain

## LinkedIn

Most blockchain apps read history through a search-index service — a system like The Graph that watches the chain and answers "show me everything this user did" in milliseconds. Until you deploy to a chain no such service supports. For us that was Ethereum Classic: contracts worked perfectly, but the wager list was empty because there was no index to query.

Our new post walks through how FairWins keeps every screen working when the index isn't there:

- "Has an index?" as per-network metadata, not a global flag — a fifth network is a config entry, not a code change.
- A stable doorway so the interface is agnostic to whether a page came from the index or a direct blockchain read.
- Why we read a per-user index built into the contract itself instead of scanning the raw event log — public nodes reject wide scans.
- Automatic fallback when a configured index errors, and honest "unavailable here" messaging for aggregate views a direct read can't cheaply rebuild.

The theme: features should either work, work slower, or say plainly that they can't — and which one happens should be a property of the network config, not a bug.

How do you handle chains your indexing service doesn't support? 🔗 <link>

#TheGraph #web3 #blockchain #infrastructure #multichain

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style depicting a branching data pipeline: a glowing central conduit splits into two parallel paths that both arrive at the same destination node — one path routed through a stylized indexed-database lattice (ordered, fast, structured), the other a more rugged direct pipe made of stacked hexagonal blockchain segments bypassing the lattice entirely. A small junction switch sits where the split occurs, suggesting per-route selection. Deep navy and teal base palette with a single warm amber accent highlighting the fallback path and the shared endpoint, conveying that both routes reach the same result. Soft volumetric lighting from the upper left, subtle depth of field, precise geometric linework, fintech-engineering mood, uncluttered negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
