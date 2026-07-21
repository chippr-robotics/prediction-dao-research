# When the Search Index Isn't There

*Keeping every screen working on a blockchain that no indexing service has ever heard of*

| | |
| --- | --- |
| **Series** | Multi-chain Infra (part 2) |
| **Part** | 2 |
| **Audience** | Product and infrastructure readers curious about blockchain data |
| **Tags** | `indexing`, `the-graph`, `resilience`, `multi-chain` |
| **Reading time** | ~7 minutes |

## The chain with no index

We were deploying FairWins to Ethereum Classic as a step toward broadening past Polygon. A member could create a wager, an opponent could accept it, and USDC moved exactly as it did on Polygon. Then someone opened the "My Wagers" list, and it was empty. Not an error — just empty, on an account that had three live wagers sitting right there on the blockchain.

The cause wasn't in our code. To understand it, you need one piece of background about how apps read blockchain history.

Reading the *current* state of a blockchain is easy — "what's this account's balance right now?" is a single quick question. But reconstructing *history* — "show me every wager this person has ever been part of, newest first" — is slow and awkward if you ask the blockchain directly. So most blockchain apps don't. They lean on a **search-index service**: a separate system that watches the chain, records everything relevant into a fast database, and answers rich history questions in milliseconds. The dominant one is called The Graph, and the little indexing recipe you give it is a "subgraph." Think of it as Google for one app's on-chain activity — instead of re-reading the whole chain every time, you query a tidy pre-built index.

The problem on Ethereum Classic was simply this: **The Graph doesn't index that chain.** There is no service to point a subgraph at. Our app knew the contract addresses, but with no running index behind it, the history query had nothing to talk to — so the list came back empty.

This is the recurring shape of a multi-chain app: the indexing service you lean on for one network simply doesn't exist on the next. You can treat that as a hard dependency and let features break on unsupported chains, or treat the index as *one of several interchangeable data sources* and fall back to a slower path that always works. FairWins takes the second route. The rule we settled on: **every screen that reads history has a fallback that talks directly to the blockchain, and whether a network has an index is a per-network setting, not a global switch.**

## "Does this chain have an index?" is per-chain data

The decision is recorded on each network individually: every network entry declares whether it has an index. Polygon and its test network carry one; Ethereum Classic and the local development chain carry none.

Keeping this strictly per-chain matters for correctness as much as coverage. A Polygon index is never queried while you're connected to Ethereum Classic, so a testnet session can never accidentally surface mainnet wagers. And adding another un-indexed network later is a configuration change, not a code change.

## One doorway, two sources behind it

The interface never talks to a data source directly. It goes through a single thin boundary, tied to whichever network you're on, that picks the right source. Two sources sit behind that doorway, and both hand back wagers in the exact same shape, so the list, detail, and report screens neither know nor care which one produced them:

- **The index source** — asks The Graph. Used when the network has an index.
- **The direct source** — reads the blockchain directly. The default for any network without an index.

Because the screens only know the doorway and a common wager shape, we could swap The Graph for a different indexing product later, or fall back to direct reads today, and nothing above the data layer would notice.

## Why reading the chain directly is usually painful — and how we avoid it

The naive way to rebuild someone's wager history by reading the chain is to scan its event log — every "a wager was created" event, filtered to that user, from the contract's first day to now. This is exactly what falls apart on public blockchain nodes. Free endpoints reject wide scans with errors like "query returned too many results," so a from-the-beginning scan collapses into a flood of throttled, range-limited requests. It's the very problem an index exists to solve.

FairWins sidesteps log scanning entirely because the wager contract was built with a per-user index *baked into the contract itself.* The contract can answer, directly and cheaply, "how many wagers does this user have?" and "give me their wagers, one page at a time." These are the cheap kind of question no node rejects, so the direct source asks for the count and pages through the wagers in fixed-size windows, capping the total per account so one extreme user can't stall the screen. Sorting, filtering, and pagination then happen on the device over that bounded set. As a bonus, the direct path reads each wager's deadlines straight from the contract — data the index's event history doesn't even carry.

## Fallback is automatic, not just configured

A missing index is only one way things go wrong. The other is a configured index that errors or goes down. FairWins handles both the same way: if a history query to the index fails, it quietly retries through the direct-blockchain source instead — and labels the result so the switch shows up in monitoring rather than passing silently.

So an Ethereum Classic member uses the direct source because that chain has no index at all, while a Polygon member whose index is briefly unreachable falls through to the direct source and still sees their wagers. The feature never hard-fails just because a data source had a bad day.

## The harder case: reports that need data direct reads can't cheaply give

Not everything degrades this cleanly. The tax and activity report needs the specific transaction reference and network fee for every transfer — details the contract's paginated views don't return. On indexed networks that's one query. On an un-indexed one it isn't, so the report falls back to two steps: first it *lists* the user's wagers through the same doorway (so enumeration always works), then it does a **bounded** event scan per wager for the transaction detail — never from the beginning. Each wager's creation time gives a tight window to search, and the scan adjusts its own chunk size on the fly under a hard request budget: shrink and retry when a node complains, grow back when things go smoothly.

This is degradation that stays honest about its limits. The report works on Ethereum Classic, but when a window genuinely can't be scanned within budget, it says so and suggests a shorter period — rather than silently returning a partial history a member might file taxes against.

## Degrade honestly, or hide honestly

Some views simply can't be rebuilt from direct reads at a reasonable cost, and the right answer there is to tell the truth rather than fake it. The "token holders" and aggregate activity panels are exactly this: rollups only an index can produce. On a network without one, they render a plain "unavailable on this network" message. The underlying balances and events are still fully enforced on-chain — only the convenient aggregated view is missing — so nothing about the actual guarantees changes.

Membership and role checks never had this problem, since they always read the blockchain directly and work identically on indexed and un-indexed networks alike.

## Why we built it this way

**Per-chain source selection over a global switch.** Treating "has an index" as network metadata means the same code serves every network, and a fifth one is a config entry rather than a branch at every call site.

**A stable doorway.** Because the interface only knows the doorway and a common wager shape, swapping indexing providers later — or falling back to direct reads today — is invisible to everything above the data layer.

**Contract-supported pagination instead of log scanning.** A per-user index inside the contract is what makes the direct path viable on nodes that reject wide scans. The fallback is only cheap because the contract was designed to be read directly.

**Bounded work with honest failure.** The report scan carries an explicit budget; when a request genuinely exceeds what a public node can serve, it surfaces an actionable error rather than a silent partial result. For a financial report, correctness outranks always returning something.

The trade-off is real: direct reads are slower and coarser than an indexed query, on-device pagination is bounded, and a few aggregate views are simply absent off the indexed chains. What we buy is that no member on an un-indexed network hits a broken screen. Every feature either works, works slower, or says plainly that it can't — and which of those happens is a property of the network's configuration, not a bug waiting on a chain the indexing service may never support.

## Further reading

- [The Graph documentation](https://thegraph.com/docs/) — what a subgraph is and which networks it supports
- [Ethereum's `eth_getLogs` reference](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getlogs) — the event-scanning method that public nodes rate-limit
- [Ethereum Classic](https://ethereumclassic.org/) — the network at the center of this story
