# One Timeline From Five Sources That Kept Disagreeing

*How FairWins merges wagers, transfers, pools, earn, and memberships into a single activity feed so the dashboard, the transfer list, and the tax report can never contradict each other.*

| | |
|---|---|
| **Series** | Multi-chain Infrastructure (part 3) |
| **Audience** | Product managers, founders, and curious builders |
| **Tags** | `activity-feed`, `data-quality`, `product`, `blockchain` |
| **Reading time** | ~7 minutes |

---

## The bug that only a single source of truth could kill

A member opens their Account tab and sees a wager payout dated "20645d ago" — fifty-six years in the future, roughly. On the same screen, the running profit-and-loss tile disagrees with the total on the tax report they downloaded ten minutes earlier. Neither number is exactly *wrong* — they were each calculated by a different part of the app, reading a different source, and over time the two had quietly drifted apart.

This is the ordinary fate of an activity feed that grows one feature at a time. FairWins had ended up with six different screens that each answered the same question — "what happened to my money?" — in isolation. The dashboard estimated wager transfers from whatever it had cached; the transfer tab read a small list kept on your device; the tax report pulled its rows from the blockchain index; pools, earn, and memberships each had their own path. And these sources have different fidelity: the blockchain index gives you real transaction times and IDs, while the cached-estimate path has neither, so it invented placeholder timestamps and left the transaction ID blank. When two screens that should add up to the same profit-and-loss are built on sources of different quality, they can't reliably agree — and on a network with no blockchain index at all, one of them has no data to show.

The fix was to replace all six reading paths with exactly one. Today the Account tab, the transfer list, the profit-and-loss tile, and the tax report all draw from the same normalized stream of activity, so their line items and totals are *structurally incapable* of disagreeing — there is only one place the numbers come from. No new server, no change to the blockchain index, no smart-contract change — just one shared layer, living in the app, that gathers and reconciles everything.

## The shape of one entry

Everything hangs off a single, uniform record. A dollar send, a wager payout, a pool refund, a failed gasless transaction — they all flatten into the same fields, so the rest of the app never has to ask "what kind of thing is this?" before displaying it. Each record carries a category (wager, transfer, earn, pool, or membership), a more specific kind, a direction, a status, the amount, an optional US-dollar value, a transaction ID and timestamp where those exist, and — crucially — where the record came from. That last field, the record's origin, is how the system decides which of two records describing the same real event should win.

## Three kinds of origin, one identity

Reconciliation begins with identity: every record gets a stable ID reflecting where it came from. There are three origins.

- **On-chain.** Read directly from confirmed blockchain history, always carries a real transaction ID. This is the high-fidelity truth.
- **Derived.** Reconstructed from on-chain *state* when there is no indexed event to read — the fallback for networks with no blockchain index. Its ID is built only from the durable facts of the event — network, wager, kind, party — and never from a timestamp or random value, so recomputing yields the same ID every time. That repeatability lets a constantly re-polling system add records without creating phantom duplicates.
- **Client-only.** Exists solely on this one device. A gasless transaction that failed before the chain ever recorded it lives here.

## The merge: a fixed pecking order, not guesswork

The hard part of any unified feed is deciding what to do when the same real-world event shows up from two sources at once. FairWins does not try to compare-and-patch the two versions; it applies a fixed pecking order and drops or folds the loser. The rules are short:

1. **Same ID, first one wins** — records with the same ID are identical by construction, so this is just de-duplication.
2. **On-chain beats derived for the same event.** Both the real indexed record and its derived stand-in are stamped with a shared key identifying the underlying event, so when a genuine on-chain record exists, the derived placeholder is dropped entirely.
3. **Client-only folds into on-chain.** A device-only record that later matches a confirmed on-chain one isn't shown twice: the on-chain record wins the financial details and absorbs whatever extra context the local record carried.

That logic is the antidote to the original bug. The old dashboard made the low-fidelity estimated path primary everywhere; the new design inverts it — the real indexed source is primary, the estimate is a clearly flagged fallback that yields the instant real data arrives, and dashboard and report agree because they read the same merged output.

## Sources that can fail without breaking the feed

Each activity domain — wagers, transfers, pools, earn, memberships — is handled by its own small adapter that only reads: none writes anything, crashes on an empty history, or returns data for the wrong network.

The feed runs all those adapters at once and waits for each to settle. The important property: if one fails, the feed does not go blank — that category is marked temporarily stale, and the app *discloses that honestly*. So if the blockchain index is down but your local transfer list is healthy, you still see your transfers, with a visible note that pool and membership history is momentarily out of date. Graceful degradation, earned one adapter at a time.

## Rules that keep the numbers honest

Before any record is shown, a normalization step enforces the guarantees that killed the original defects:

- **A timestamp is either a real date or explicitly nothing — the placeholder "zero" date never survives.** A missing or zero time becomes an honest "date unavailable," so "20645d ago" is now impossible.
- **A failed operation counts as moving no money.** Failed items are still *listed everywhere* — a failed gasless send, with the exact reason it failed, is first-class history — but excluded from every total.
- **An asset with no known price is flagged, never silently valued at zero,** so it can't quietly skew your profit-and-loss.
- **Records are strictly scoped to the network you asked about,** so one network's data can never leak into another's totals.

## Durability without keeping a dossier

On-chain and derived records are never stored — they rebuild from public blockchain data on any device, which keeps backups tiny and keeps FairWins from hoarding a profile of your activity. Only the device-only records need durable storage, kept as an append-only log inside the platform's existing encrypted backup and merged by de-duplication on restore, so history is never destructively overwritten.

## Why we built it this way

- **Reconcile in the app, not on a server.** A server-side ledger would only see traffic that passed through our relayer, would add another thing that has to be online, and would mean keeping a dossier of every member's activity — against the platform's privacy stance. Every source was already readable from the app; all that was missing was one layer to gather and reconcile it.
- **A fixed pecking order beats fuzzy reconciliation.** Assigning every event an origin and applying one clear precedence rule is simpler and more predictable than comparing two versions and patching them together — and repeatable derived IDs make it safe to run over and over.
- **Honest degradation, and known limits stated plainly.** Stale categories, unpriced assets, and unavailable dates are all surfaced so limits are disclosed, never hidden; automatic cleanup can never touch the current or previous tax year. Earn actions taken outside the app aren't in the feed, and pool and membership history need the network's blockchain index — on index-free networks those return an honest empty list rather than a wrong guess.

The result is boring in the best possible way: one reading path, five categories, three kinds of origin — and a dashboard and tax report that finally read from the same page.

## Further reading

- The Graph — how blockchain data gets indexed for apps to read: https://thegraph.com/docs/
- Unix time — why a "zero" timestamp renders as a date decades off: https://en.wikipedia.org/wiki/Unix_time
- For more on how FairWins is built, see the FairWins developer documentation.
