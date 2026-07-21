# CallsignRegistry: An In-House ENS-Style Naming System That Nothing Depends On

*How FairWins built a commit–reveal naming registry as an optional perk — and kept it strictly off the value path*

---

- **Series:** Standalone
- **Part:** 33 of 34
- **Audience:** Naming/identity engineers, product teams, Solidity engineers
- **Tags:** `naming`, `ens`, `commit-reveal`, `identity`, `uups`
- **Reading time:** ~9 minutes

---

## The Forty-Character Problem

Maya wants to invite her friend Dev to a wager on Sunday's match. The invite form wants a wallet address. Dev's address is `0x7f3a…` — forty-two characters of hex that Maya has to fetch from a chat thread, paste, and then squint at, because a wrong character means the invite (and eventually the stake) goes to a stranger.

Every crypto product hits this wall, and the ecosystem's standard answer is ENS: register `dev.eth`, type a name instead of hex. But ENS is an Ethereum-mainnet system, and FairWins runs its wager escrow on Polygon and the Mordor testnet. More importantly, FairWins already has an identity spine ENS knows nothing about: an on-chain `MembershipManager` with tiers, sanctions screening, and role-gated access. A name that resolves to "some wallet somewhere" is less useful than a name that resolves to "a screened, top-tier member of this platform."

So spec 054 built the thing in-house: the **CallsignRegistry** (`contracts/naming/CallsignRegistry.sol`), a UUPS-proxied naming contract where a Gold-tier-or-above member may optionally register a `%callsign` — `%chipprbots`, say — that resolves trustlessly to their wallet across every address-entry and display surface in the app.

The interesting part isn't that FairWins built an ENS-lite. It's the two disciplines wrapped around it: the registry borrows ENS's hardest-won mechanism (commit–reveal registration) while deliberately rejecting its most flexible one (separating name controller from resolution target), and the whole system is engineered so that *nothing of value ever depends on it*. A member can create, accept, and settle every wager they'll ever make with a raw address and never touch the registry. That optionality is a tested invariant, not a marketing line.

## A Name Format Chosen for Safety, Not Expressiveness

A callsign is 3–20 characters of `a-z0-9` plus single interior hyphens — no leading, trailing, or consecutive hyphens, no uppercase, no Unicode. The on-chain validator (`_validate` in `CallsignRegistry.sol`) enforces this byte by byte, and the frontend mirrors it in `frontend/src/lib/callsigns/normalizeCallsign.js`.

The ASCII whitelist is the impersonation defense. ENS supports Unicode names and inherits an entire research area of homoglyph attacks — Cyrillic `а` versus Latin `a`, and thousands of confusable pairs that ENSIP-15 normalization tries to tame. Spec 054's research explicitly rejected Unicode normalization in favor of the blunter tool: if the only registrable characters are lowercase ASCII letters, digits, and hyphens, there is no confusable pair to defend against. Names are keyed by `keccak256` of the canonical string, and case variants normalize to the same lookup before they reach the chain.

## Commit → Reveal, Plus a Griefing Fix

Naming registries have a classic front-running problem: you broadcast `register("chipprbots")`, a mempool observer sees it, and their bot registers the name one block ahead of you. ENS's `.eth` registrar solved this with commit–reveal, and CallsignRegistry adopts the same pattern:

1. `makeCommitment(callsign, owner, salt)` — a pure function returning `keccak256(abi.encode(callsignHash, owner, salt))`.
2. `commit(commitment)` — stores only the opaque hash on-chain. Observers learn nothing.
3. Wait at least `minCommitmentAge` (default 1 minute).
4. `register(callsign, salt)` — the reveal. By the time the name is visible, your priority is already locked; a sniper's own commitment can't be old enough.

Commitments expire after `maxCommitmentAge` (default 1 day), which prevents commitment squatting. But the implementation also closes a subtler hole that the naive version of this pattern leaves open. A commitment hash is public calldata — anyone can see it once you've committed. If `commit` blindly overwrote the stored timestamp, an attacker could replay *your* commitment every few blocks, perpetually resetting its age so your reveal forever fails with `CommitmentTooNew`:

```solidity
function _commit(bytes32 commitment) internal {
    // Reject re-committing a still-unexpired commitment — re-commit is
    // allowed only once the prior one has expired (ENS anti-snipe pattern).
    uint64 existing = commitments[commitment];
    if (existing != 0 && block.timestamp <= uint256(existing) + maxCommitmentAge) {
        revert CommitmentPending();
    }
    commitments[commitment] = uint64(block.timestamp);
    emit CallsignCommitted(commitment, uint64(block.timestamp));
}
```

This reveal-griefing fix was one of two MEDIUM findings hardened during the spec's security review; the other appears below in the repoint flow.

## The Gold Gate — and the Optionality Doctrine

Registration is gated on membership: `_requireEligible` checks `membershipManager.getActiveTier(user, membershipRole) >= minTier`, where the role is `WAGER_PARTICIPANT_ROLE` and `minTier` initializes to Gold. The gate is tunable but only upward — `setMembershipGate` reverts with `TierBelowFloor` if an admin tries to drop it below Gold. A hard floor in code, not a policy document. Sanctions screening rides along in the same check when a guard is configured.

The mirror-image rule is the one that shapes the whole design: **nothing on the value path may require a callsign** (FR-001a). No wager creation, pool join, transfer, or claim reads the registry as a precondition. This isn't left to convention — the integration suite (`test/integration/callsignRegistry.membership.test.js`) includes a below-Gold, callsign-less account completing a full wager end to end. The registry can be undeployed on a chain, unreachable, or paused, and every dollar-moving flow works identically.

That's also why the registry is a *standalone* UUPS proxy. It is not routed through `WagerRegistry`, holds no funds — there are no payable functions and no token custody, so its worst-case failure is cosmetic — and it lives at a stable address with append-only storage, a trailing `__gap`, and the CI-gated `npm run check:storage-layout` shared by the platform's other proxies. Deployment keys are `callsignRegistry` / `callsignRegistryImpl` in `deployments/<network>.json`, resolved in app code via `getContractAddressForChain('callsignRegistry', chainId)`.

## Lifecycle: Quarantine, Cooldown, Repoint, Lapse

A name that routes payments needs a careful lifecycle. Callsigns move through six statuses — `NONE`, `ACTIVE`, `REPOINTING`, `QUARANTINED`, `SUSPENDED`, `LAPSED_RECLAIMABLE` — governed by bounded, operator-tunable policy parameters:

- **Release and change enter quarantine.** A released or replaced callsign is unregistrable by *anyone* — including its former owner — for `quarantinePeriod` (default 90 days). Payments and invitations aimed at the old name cannot be silently captured by a stranger who re-registers it. Changes are additionally rate-limited by `changeCooldown` (default 30 days).
- **Repointing is delayed, visible, and cancellable.** Here's where the design diverges from ENS on purpose. ENS separates the name's owner from its resolver record, which is flexible — and is exactly the payout-redirect vector spec 054 guards against. A callsign points at one address, and moving it (`requestRepoint` → wait `repointDelay`, default 48 hours → `finalizeRepoint`) puts the name into `REPOINTING`, during which it is refused for value-bearing resolution and surfaces show an honest "address changing" state. A compromised session that requests a repoint gives the real owner two days of visible warning to `cancelRepoint`. Requesting is tier-exempt (a downgraded owner is never stranded holding their own identity), but the security review added a second hardening: `finalizeRepoint` requires the *incoming* owner to be Gold-eligible — otherwise a lapsed member could repoint names around a ring of wallets to reset the lapse clock and hoard them for free. Finalizing also clears the `verified` marker, because verification was granted to a reviewed identity, not to a name. Suspension, deliberately, persists across a repoint.
- **Lapse is grace-then-release.** If Gold coverage ends, the callsign stays `ACTIVE` until the membership term expires, then survives a `lapseGrace` window (default 365 days). Only after that does the permissionless `reclaimLapsed` push it into standard quarantine.

Moderation follows least privilege: `REGISTRY_CURATOR_ROLE` reserves terms (brand names, `admin`, `support`), `MODERATOR_ROLE` suspends, `VERIFIER_ROLE` marks business callsigns verified. None of these roles — nor the platform operator — can ever reassign a callsign to a different wallet. Suspension stops resolution; it never moves a name or touches funds.

## Resolution: Exact-Match Forward, Guarded Reverse

Forward resolution (`resolve(string)`) is exact-match only — no fuzzy matching, no "did you mean," because a near-match substitution on an address-entry field is a payment misdirection bug. Reverse resolution is guarded by a forward==reverse invariant: an address's displayed callsign must currently resolve back to that address.

```solidity
function callsignOf(address account) external view returns (string memory) {
    bytes32 h = callsignHashOf[account];
    if (h == bytes32(0)) return "";
    // Reverse only reports a callsign whose forward resolution is ACTIVE.
    if (_statusOf(h) != CallsignStatus.ACTIVE) return "";
    return _records[h].callsign;
}
```

A suspended, repointing, or lapsed callsign simply disappears from display rather than telling a stale story.

On the frontend, callsigns slot into an existing name-resolution chain rather than replacing it. `frontend/src/hooks/useOpponentName.js` resolves any counterparty in priority order: **address book > callsign > ENS > generated**. Your own private nickname for an address always wins; a registered `%callsign` beats an ENS name; and a deterministic two-word generated name is always available synchronously so no card ever shows a spinner or raw hex. Every step soft-fails — if the registry is undeployed on the current chain or a lookup times out, the chain falls through silently. Address entry (`frontend/src/components/ui/AddressInput.jsx`) accepts `%callsign` input, resolves it, and shows the full resolved address plus verification status for explicit confirmation before anything is committed. Only an `ACTIVE` callsign is committable.

## Gasless Twins, Same Three-Way Sync

Like every actor-facing contract on the platform, each callsign action has an EIP-712 `…WithSig` twin via `SignerIntentBase`: `commitWithSig`, `registerWithSig`, `changeCallsignWithSig`, `releaseWithSig`, `requestRepointWithSig`, `cancelRepointWithSig`, under the domain `"FairWins CallsignRegistry"` / version `"1"`. The six intent structs must stay byte-identical in three places — the contract typehashes, `frontend/src/lib/relay/intentTypes.js`, and `services/relay-gateway/src/intent/intentTypes.js` — and the release/repoint intents pin the exact `callsignHash` so a relayed signature can't be applied to a different name. `finalizeRepoint` and `reclaimLapsed` are permissionless and need no signed twin. Per the platform's never-stranded rule, every gasless path keeps a self-submit fallback.

## Design Decisions

- **In-house over ENS integration.** The registry needed membership gating, sanctions screening, role-based moderation, and presence on chains where ENS doesn't live. ENS still participates — as step three of the display chain — but the platform-native handle is anchored to platform-native identity.
- **ASCII whitelist over Unicode normalization.** Less expressive, categorically safer. The homoglyph attack surface is eliminated rather than mitigated.
- **One name, one address — no resolver indirection.** Splitting controller from target invites payout-redirect fraud; FairWins' passkey smart accounts already keep their address across credential recovery, so repointing is a rare migration action worth a 48-hour delay, not an everyday record edit.
- **Direct chain reads over a subgraph.** Callsign→address routes value; an indexer would add a second, laggier source of truth. The trade-off shows up in the admin console: with no on-chain counters, registry metrics come from a bounded client-side event scan with an honest "recent window only" banner.
- **Perk, not primitive.** Gating registration at Gold makes the callsign a membership benefit; hard-flooring the gate and testing the no-callsign wager path keeps it from ever hardening into a requirement.

The result is a naming system with ENS's registration security, a narrower and safer resolution model, and a blast radius engineered to zero: if the CallsignRegistry vanished tomorrow, every wager would still settle — some screens would just show hex again.

## Sources

- `specs/054-callsign-registry/spec.md`, `plan.md`, `research.md`, `data-model.md`
- `contracts/naming/CallsignRegistry.sol` (interface: `contracts/interfaces/ICallsignRegistry.sol`)
- `docs/developer-guide/callsigns.md`
- `docs/developer-guide/upgradeable-contracts.md`
- `frontend/src/hooks/useOpponentName.js`, `frontend/src/lib/callsigns/normalizeCallsign.js`, `frontend/src/components/ui/AddressInput.jsx`
- `frontend/src/lib/relay/intentTypes.js`, `services/relay-gateway/src/intent/intentTypes.js`
- `test/integration/callsignRegistry.membership.test.js`
- ENS `.eth` registrar commit–reveal registration: https://docs.ens.domains/
- ENSIP-15 (ENS name normalization): https://docs.ens.domains/ensip/15
- EIP-712 (typed structured data signing): https://eips.ethereum.org/EIPS/eip-712
- ERC-1822 / UUPS proxies: https://eips.ethereum.org/EIPS/eip-1822 and OpenZeppelin upgradeable contracts docs: https://docs.openzeppelin.com/contracts/5.x/api/proxy
