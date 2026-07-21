# One Address, Everywhere: Why Deterministic Deployment Matters

*How FairWins keeps the same smart contract at the same address across three blockchains — and why a single source of truth for those addresses is the part that really prevents outages*

| | |
|---|---|
| **Series** | Contract Architecture, part 3 |
| **Audience** | Product managers, founders, and the crypto-curious |
| **Tags** | `multi-chain`, `reliability`, `behind-the-scenes` |
| **Reading time** | ~7 minutes |

---

## The bug that ships silently

Picture the failure mode every team that runs on more than one blockchain eventually hits. You redeploy a smart contract to a test network — maybe a small tweak, maybe a routine update. The deploy tool prints out a fresh address for the contract. Someone updates the app to point at it. But the search-and-indexing service still points at the old address. And a background service — the one that pays transaction fees on users' behalf — was configured months ago and nobody remembers to change it.

Nothing crashes. The app talks to the new contract, the indexer watches the old one, and the background service tries to help users interact with a contract that no longer matches what it expects. Users see wagers that seem to "exist" but never show up in listings, or transactions that mysteriously fail. The bug isn't in any single system. It's in the drift between them.

FairWins runs its escrow, membership, and settlement machinery on three live blockchains at once — a couple of test networks and one production network. Three separate systems consume every contract's address: the web app, an indexing service that makes data searchable, and a background service that sponsors fees for users. That's a lot of places for a single address to fall out of sync.

The defense has two layers, and it's worth being precise about what each one does. Deterministic deployment makes addresses reproducible — running the same deploy produces the same address every time, and often the same address on every chain. A single source of truth makes addresses consistent — every system reads from one authoritative record per chain. The first layer gets all the attention. The second is the one that actually prevents the outage.

## Layer one: the same address by design

A smart contract lives at an address, the way a house sits at a street address. Normally, that address is derived partly from how many transactions the deploying account has ever sent — its history. Run the same deploy twice, or run it on a chain where the account happened to send one extra transaction, and you get a different address. History leaks in.

There is a well-established alternative that removes history from the equation. Instead of depending on transaction count, the address is computed purely from three ingredients: who is doing the deploying, a chosen label (often called a "salt"), and the exact contents of the contract. Same three ingredients, same address — on any chain.

The "who is deploying" part is the subtle one. If each chain used its own one-off deployment helper, those helpers would sit at different addresses and the whole scheme would collapse. The fix is a shared, industry-standard deployment helper that already exists at the same address on every major chain — the same open infrastructure the Safe wallet ecosystem relies on. Because that shared helper is the "who," every chain computes the same result.

Two nice properties fall out of this. First, before spending anything, the deploy process can calculate where a contract will land and check whether it's already there. If it is, the deploy reuses what exists. So a half-finished deploy can be re-run safely: whatever landed stays put, whatever didn't gets finished. Re-running is a no-op, not a duplicate. Second, the salt is a plain, versioned label. Bump the version and you get a clean, parallel set of addresses for a new generation of contracts, while the old ones stay untouched and reachable.

## Where sameness holds, and where it honestly doesn't

Here is the part most explanations skip. "Same address on every chain" only holds when all three ingredients match — and the contract's contents include its start-up settings. Change a setting per chain and the contents change, so the address changes. That is not a bug; it is the system working correctly.

A few honest examples from FairWins:

- A contract that manages account keys takes no start-up settings, so it sits at the exact same address on all three chains. Full sameness.
- A sanctions-screening contract needs to know which watchlist to consult. On the test networks it points at a stand-in list; on production, a real commercial sanctions feed. Different setting, different contents, different address — exactly as intended.
- The upgradeable contracts — the wager registry, the membership manager, the wager-pool factory — don't use this trick at all. Each is deployed once per chain and then never redeployed. When the logic needs to change, it's swapped in place at the same address, with an automated safety check making sure the swap can't scramble the data already stored there. Stability by policy rather than by math.

The honest summary: the "same address everywhere" trick applies only to simple, unchanging, setting-free contracts. Everything else gets per-chain address stability instead — which turns out to be exactly what the rest of the system needs.

## Layer two: one record per chain, one lookup everywhere

Because addresses can legitimately differ per chain, no part of the system is allowed to assume they don't. Every deploy writes its results to a per-chain record: which network, which addresses, which settings, which starting point for indexing. The team treats those records as the single source of truth, and three systems read from them.

The web app never has addresses typed in by hand. A sync step reads the record and regenerates the app's address list automatically. At runtime, one lookup answers "what's the address of this contract on this chain?" It's chain-aware and honest about absence: the test networks have no connection to certain external prediction markets, so those entries simply don't exist there, and the app quietly hides that capability rather than pointing at a wrong address. Even the "live on these networks" list on the marketing site is derived from the same records.

The indexing service reads the same addresses and starting points, so it watches the right contracts from the right block.

The fee-sponsoring background service is the strictest reader of all. It loads the records at startup and refuses to boot if any chain it serves is missing its core addresses. The reasoning is simple: a service that pays real gas for users' transactions must never act on a contract it can't positively identify. A loud crash at startup is infinitely cheaper than quietly doing the wrong thing in production.

Same information, three ways of consuming it — regenerated config for the app, watch-lists for the indexer, a boot-time safety check for the background service — all flowing from one record per chain.

## Why we built it this way

**Standard infrastructure over a homegrown deployer.** Rolling our own deployment helper would mean guarding an extra key on every chain and taking on a new thing to audit. The shared, battle-tested helper already exists at one address across the chains we target, so we lean on it.

**Re-runnable deploys over fragile ceremonies.** Because a deploy checks whether a contract already exists before doing anything, "deploy it" and "confirm it's deployed" are the same command — no separate resume procedure to maintain.

**Recorded addresses over computed ones.** A tempting shortcut is to have every system recompute addresses on the fly. We deliberately don't. The upgradeable contracts don't follow the math, settings vary by chain, and a computed address only tells you where a contract would be — not that the right thing is actually there.

**Always look it up per chain.** Even for the contract that happens to share one address everywhere today, the code still looks it up per chain. Hardcoding "it's the same everywhere" bakes today's coincidence into tomorrow's outage.

The trade-offs are real. The shared deployment helper is a dependency we don't own; if a future chain lacks it, someone has to install it first. Byte-for-byte identical contract contents requires build discipline. And the "same address everywhere" trick doesn't extend to upgradeable contracts, which carry their own upgrade-governance burden instead. Deterministic deployment is a tool, not a doctrine. The single source of truth is the doctrine.

## Further reading

- [EIP-1014: the CREATE2 address scheme](https://eips.ethereum.org/EIPS/eip-1014) — the standard behind reproducible contract addresses
- [The Safe Singleton Factory](https://github.com/safe-global/safe-singleton-factory) — the shared, same-address-everywhere deployment helper
- [OpenZeppelin's guide to upgradeable contracts](https://docs.openzeppelin.com/contracts/5.x/api/proxy) — how a contract keeps one address while its logic changes
