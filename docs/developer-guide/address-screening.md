# Address screening: every list, every network, one honest pill

**Spec:** [021 (amendment 2026-09-06)](../../specs/021-address-book/spec.md) · **Issue:** #1458 ·
**Code:** `frontend/src/lib/screening/`, `hooks/useEstateScreening.js`,
`components/ui/ScreeningPill.jsx`, `components/ui/AddressScreenNotice.jsx`

## What changed, and why

The original screen asked one question — *does the FairWins `SanctionsGuard` on the wallet's
chain allow this address?* — and rendered nothing when the answer was yes. Two problems:

1. The guard exists on three chains. On Ethereum, Optimism, Arbitrum and Base every address was
   *Unscreened*, while the Chainalysis oracle and the USDC freeze list sat readable on those
   very chains.
2. "Nothing" is not an answer a member can act on. A clear result that renders as silence is
   indistinguishable from a screen that never ran.

Now an entered address is checked against **every configured source on every chain in the
cohort**, and the member gets ONE word with the receipts one tap away.

## The sources (`lib/screening/sources.js`)

| Kind | Read | Where | What a flag means |
|---|---|---|---|
| `fairwins-guard` | `SanctionsGuard.isAllowed` (+ `isDenied` for the reason) | wherever `getContractAddressForChain('sanctionsGuard', id)` resolves | a wager / membership / pool action with this address **reverts** |
| `chainalysis-oracle` | `isSanctioned` on the Chainalysis Sanctions Oracle | 1 / 10 / 137 / 42161 at `0x40C5…C8fb`, Base at `0x3A91…739B` | on the OFAC SDN list |
| `issuer-freeze` | `isBlacklisted` (Circle USDC) / `isBlackListed` (Tether USDT) | native USDC on the five mainnets + Amoy; USDT on Ethereum | the issuer has frozen it — that token sent here **cannot be moved** |

Every row was verified by a live read before it was written down (`eth_getCode` non-empty, the
zero address answering `false`, a known SDN address answering `true`). **A row is a claim that
the contract at that address exposes that selector.** A wrong row does not fabricate a verdict —
the call reverts and the source reports `unreadable` — but it silently costs a member a source.
Verify before adding one, and only list NATIVE issuer contracts: a bridged token has no freeze
function.

Chains with no source (Ethereum Classic, Mordor, the non-EVM ids) are **reported as uncovered**,
never counted as clear.

## Two reading states, four verdicts, one rule (`lib/screening/verdict.js`)

A reading is `{ status: 'read', flagged }` or `{ status: 'unreadable', reason }`. The verdict:

| Verdict | Condition | Pill |
|---|---|---|
| `flagged` | ANY source answered "listed" | red, `role="alert"` |
| `screened` | EVERY configured source answered, none flagged | green |
| `partial` | nothing flagged, ≥1 answered, ≥1 unreadable | amber |
| `unscreened` | nothing answered (or nothing to ask) | amber |

The asymmetry is the feature. A flag is a positive fact from a named list and stands on its own.
"Clear" is the absence of a flag from **every** list, so one list that did not answer means the
absence was never established — `screened` requires `unreadable === 0`, and there is no way to
reach green with a source missing.

The verdict is **derived from the readings, never stored**: the readings are what is cached, so
the rows a member expands always match the pill.

## The sweep (`lib/screening/screenEstate.js`)

`screenAddressAcrossEstate(address, opts)`:

- **Cohort-bounded** — `cohortChainIds()`; constitution III forbids reading across the
  testnet/mainnet boundary, and `readProviderFor` refuses an out-of-cohort chain regardless.
- **Failure-isolated** — every source resolves on its own. The function **never rejects**.
- **Deadline-bounded** — `DEFAULT_DEADLINE_MS` (8 s) per source; a timeout is `unreadable` with
  that reason (spec-104 lesson: an unbounded wait turns one failure into a hung surface).
- **Spec-069 providers** — `readProviderFor(chainId, walletChainId, walletProvider)`. Never
  `NETWORKS[chainId].rpcUrl`.
- **Cached** per lowercase address + chain set for `SCREENING_TTL_MS` with in-flight
  de-duplication; `force: true` bypasses, `forgetEstateScreening(address)` evicts.
- Test seams: `providerFor`, `sourcesFor`, `chainIds`, `deadlineMs`.

## Two hooks, on purpose

| Hook | Question | Used by |
|---|---|---|
| `useAddressScreening` (spec 021) | does the guard on **this** chain allow it? | everything that **gates a submission** — Transfer, Pay, Bridge, Supply, group pay — forced and live at submit time (FR-032) |
| `useEstateScreening` (this amendment) | is it flagged **anywhere**? | `AddressScreenNotice` — the pill under every address field |

Do not collapse them. The per-chain read is the one the contract will repeat, and it must stay a
live read on the chain the value moves on. The estate read is advisory and its cache is fine.

## The pill (`components/ui/ScreeningPill.jsx`)

Icon + word for every state (WCAG 1.4.1 — never colour alone). It is a `button` with
`aria-expanded`; expanding lists every source per network with `Clear` / `Flagged — <detail>` /
`Could not read — <reason>`, and every uncovered network with `No screening source on this
network`. The network the surrounding flow acts on is marked `(this network)`. Fills are opaque
status tokens paired with their text tokens (spec 090 rule 3) — no literal colour.

`AddressScreenNotice` wraps it with the sentence from `describeVerdict` and the ⓘ, and now
renders for **every** valid address. It is mounted under the recipient field in Transfer, Pay,
the wager-create opponent field, and each address row of the contact editor.

## The no-chain e2e tier

The fast tier's RPC stub answers `0x` to every `eth_call` it does not model, so every source is
`unreadable` there and the pill must read **Unscreened** or **Partly screened** — never green.
`[MS-06]` in `34-member-surfaces.cy.js` asserts exactly that, and that the expanded rows say
*Could not read*. `[CM-01]` in `31-identity-access.cy.js` models the guard's `isAllowed` as
`false` and asserts the notice is an `alert` naming the FairWins guard.

## What is deliberately not here

- **Subgraph indexing of `DenyListUpdated`.** A single-address verdict is a point read; the
  subgraph would add a per-network deploy dependency and no new fact. Follow-up if the operator's
  reason text is wanted in the UI.
- **Off-chain risk providers** (TRM, Chainalysis KYT, Elliptic). The source shape —
  `read(provider, account) → { flagged, detail }` — is what one would implement, behind a
  member-held credential. Nothing here should ever route a member's counterparty through a
  FairWins-held API key.
- **Enforcement.** Nothing in this feature blocks. The on-chain guard and the issuing token do.
