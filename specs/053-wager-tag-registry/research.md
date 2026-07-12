# Research: Wager Tag Naming Registry (spec 053)

All Technical Context unknowns resolved. Each decision below records what was chosen, why,
and what was rejected.

## R1. Registry contract shape: UUPS proxy, single facet

**Decision**: One new upgradeable contract, `contracts/naming/WagerTagRegistry.sol`, deployed
as a UUPS proxy inheriting `contracts/upgradeable/UUPSManaged.sol` (per the repo-wide rule)
plus `SignerIntentBase` for gasless twins. Deployment keys `wagerTagRegistry` /
`wagerTagRegistryImpl` in `deployments/`, registered with `check:storage-layout`.

**Rationale**: Clarification fixed the source of truth on-chain. Policy parameters
(quarantine, cooldown, repoint delay, grace) and moderation rules will evolve — an
upgradeable proxy at a stable address is exactly what specs 025/027 established for this
situation. The registry holds no funds, so the code-size pressure that forced the
WagerRegistry two-facet split (spec 035) does not apply; a single implementation is far
simpler and expected to fit the 24 KB limit comfortably.

**Alternatives considered**: Immutable contract (rejected: policy params and moderation
surface will change; redeploying a *naming* registry breaks every stored reference to it);
ERC-1167 clones (rejected: registry is a singleton, not a per-instance product like pools);
extending `MembershipManager` (rejected: unrelated storage/lifecycle, and 027's proxy should
stay single-purpose).

## R2. Tag keying and on-chain validation

**Decision**: Tags are stored as their canonical normalized string and keyed by
`keccak256(bytes(tag))`. The contract enforces canonical form at the byte level: length
3–20, bytes restricted to `a-z`, `0-9`, and `-` with no leading/trailing/consecutive
hyphens. Uppercase is rejected on-chain (clients normalize before submitting); `%` is never
part of the stored value.

**Rationale**: Byte-restricted ASCII is the spec's homoglyph defense (FR-003/FR-005) and is
cheap to validate in a loop on-chain (max 20 bytes). Enforcing canonical-form-only on-chain
means case-insensitive uniqueness needs no on-chain lowercasing: two casings hash to the
same key only because only one casing is admissible. Keying by hash gives O(1) forward
lookup and event-indexable topics.

**Alternatives considered**: ENSIP-15/UTS-46 Unicode normalization (rejected: Unicode is
out of scope per spec assumption; ASCII whitelist is the stronger and simpler defense);
storing only hashes without the string (rejected: reverse display needs the human-readable
tag without an off-chain index).

## R3. Claim-snipe prevention: ENS-style commit–reveal

**Decision**: Two-step registration. `commit(bytes32 commitment)` stores
`keccak256(abi.encode(tagHash, owner, salt))` with a timestamp; `register(tag, salt)`
succeeds only if a matching commitment is older than `minCommitmentAge` (60 s) and younger
than `maxCommitmentAge` (24 h). Both steps have gasless `…WithSig` twins.

**Rationale**: This is the industry-standard (ENS .eth registrar) answer to FR-006: the
mempool observer sees only an opaque commitment, and by the time the reveal is visible the
claimant's priority is already locked. The min age defeats same-block front-running; the max
age stops commitment squatting.

**Alternatives considered**: First-come registration relying on the private relayer path
(rejected: self-submit fallback is mandatory — the never-stranded rule — so the public
mempool path must be snipe-proof on its own); registration via operator signature
(rejected: makes the platform a registration gatekeeper, contradicting the trustless-
resolution decision).

## R4. Single binding address; repoint moves it after a delay

**Decision**: A tag record has exactly one bound address — the owner IS the resolution
target. Repointing (`requestRepoint(newAddress)` → 48 h delay → `finalizeRepoint()`,
cancellable meanwhile via `cancelRepoint()`) moves both control and resolution to the new
address atomically at finalization. Views expose the pending state; forward resolution
reports status `REPOINTING` during the delay and resolvers MUST refuse value-bearing use.

**Rationale**: Splitting "controller" from "target" (ENS owner vs. resolver record) invites
exactly the payout-redirect fraud the spec guards against, and the platform's passkey smart
accounts already keep their address across credential recovery — repoint exists for wallet
migration, which is a whole-identity move. One address keeps the reverse mapping unique and
the mental model honest.

**Alternatives considered**: Separate owner/target fields (rejected: doubles the takeover
surface, complicates reverse-resolution integrity FR-008); instant repoint or permanent
binding (both rejected in clarification session).

## R5. Membership gate and lapse grace

**Decision**: Registration/change/repoint require an active membership:
`IMembershipManager.hasActiveRole(user, role)` for any role in an admin-configurable
qualifying-role set (initially `MARKET_CREATOR_ROLE` and `POOL_PARTICIPANT_ROLE`).
Lapse-then-release is enforced lazily: once the account's latest qualifying-membership
`expiresAt` is more than the 12-month grace in the past, anyone may call
`reclaimLapsed(tag)`, which releases the tag into the standard 90-day quarantine. Until
that call, views still resolve the tag (grace is honored by timestamp math, not by a keeper).

**Rationale**: Reuses the existing membership proxy (`getMembership(...).expiresAt` is
already exposed) rather than duplicating membership state. Lazy, permissionless reclamation
avoids any trusted keeper: the incentive to call it is wanting the tag. Timestamp-computed
views mean no one can capture a tag early by racing a cron job.

**Alternatives considered**: Operator-run expiry sweeps (rejected: trusted keeper +
liveness dependency); registry subscribing to membership events (rejected: MembershipManager
has no such hook surface and adding one couples two proxies' upgrade cadences).

## R6. Reserved names and moderation

**Decision**: `mapping(bytes32 => bool) reserved` maintained by a `REGISTRY_CURATOR_ROLE`
(batch `setReserved(bytes32[] hashes, bool)`); an initial list (platform brand terms,
`admin`, `support`, `official`, `help`, …) is seeded at deployment from a checked-in JSON
list. `MODERATOR_ROLE` can `suspend`/`unsuspend` a tag (stops resolution + display, never
reassigns). `VERIFIER_ROLE` sets/clears the business verification flag. All role actions
emit events (audit, FR-023).

**Rationale**: Hash-keyed reservation composes with R2's canonical-form validation:
confusables are excluded by charset, so exact-hash reservation suffices. Separate
least-privilege roles mirror `UUPSManaged`'s pattern and keep the constitution's
access-control reasoning simple: no role can move a tag to a different owner — that
capability simply does not exist in the code.

**Alternatives considered**: Merkle-root reserved list (rejected: list is small and
mutable; mapping writes are simpler and individually auditable); off-chain-only moderation
(rejected: resolution is on-chain, so suspension must be too or clients could bypass it).

## R7. Resolution reads: direct contract views, no subgraph dependency

**Decision**: Forward (`resolve(tag)` → `(address, status, verified)`) and reverse
(`tagOf(address)` → canonical string) are pure contract views consumed by the frontend via
a new `frontend/src/lib/tags/` module using the existing provider plumbing and
`getContractAddressForChain('wagerTagRegistry', chainId)`. Status is an enum
(`ACTIVE / NONE / QUARANTINED / REPOINTING / SUSPENDED / LAPSED_RECLAIMABLE`) so clients
render honest state (constitution III). Subgraph indexing of tag events is deferred —
on-chain events already satisfy the FR-023 audit trail, and no v1 surface needs bulk tag
queries.

**Rationale**: Tag→address is a single mapping read; adding an indexing dependency would
create a second (laggier) source of truth for a lookup that routes value. Reverse display
lookups are per-address and cacheable with the same short-TTL approach the ENS hook uses.

**Alternatives considered**: Subgraph-backed resolution (rejected: staleness is dangerous
for payments; FR-016 wants current registry state); event-log scanning client-side
(rejected: slow on public RPCs).

## R8. Display + entry integration points

**Decision**:
- `useOpponentName` gains a tag step: address book > **wager tag** > ENS > generated,
  via a new `useWagerTag(address)` hook (reverse lookup, short-TTL cache, silent failure →
  chain falls through, FR-013). Tags render as `%<tag>` (`formatTag`).
- `AddressInput` (already the shared entry component with address-book + ENS affordances)
  learns tag entry: input matching `/^%?[a-z0-9-]{3,20}$/i` triggers forward resolution;
  the resolved full address + verification badge render in the existing confirmation
  affordance before the value is committed (FR-009/FR-011). Sanctions screening keeps
  operating on the resolved address (unchanged code path, FR-012).
- Registration/management UI is a new `WagerTagPanel` in the account settings area
  (commit–reveal progress, change/release/repoint with their windows surfaced).

**Rationale**: Both surfaces are the single shared components the rest of the app already
funnels through, so FR-009's "every address entry surface" is satisfied by one integration
each, matching how ENS and the address book were integrated (specs 038/040).

**Alternatives considered**: Per-surface integration (rejected: N copies of resolution +
confirmation logic); replacing `useOpponentName` (rejected: additive step preserves spec 040
behavior and its tests).

## R9. Gasless rail: relayed EIP-712 intents (spec 035 pattern)

**Decision**: Every actor action gets a `…WithSig` twin via `SignerIntentBase`:
`CommitTagIntent`, `RegisterTagIntent`, `ReleaseTagIntent`, `ChangeTagIntent` (release+commit
semantics), `RequestRepointIntent`, `CancelRepointIntent`, `FinalizeRepointIntent`. The
struct definitions are added, byte-identical, in the three mandated places (contract
typehashes, `frontend/src/lib/relay/intentTypes.js`,
`services/relay-gateway/src/intent/intentTypes.js`) and the relay-gateway policy allowlists
them. Self-submit fallback everywhere (never-stranded rule). No EIP-3009 leg — registration
is free with membership, so there is no payment to staple.

**Rationale**: Tags are an account-identity action, same category as the wager/membership
intents already on this rail; sponsored UserOps (spec 050) are for passkey account-native
ops and would leave EOA members without a gasless path.

**Alternatives considered**: Paymaster-sponsored UserOps only (rejected: EOA coverage);
no gasless support in v1 (rejected: registration is the membership perk's front door, and
commit–reveal doubles the tx count — exactly where gaslessness matters).

## R10. Policy parameters

**Decision**: `minCommitmentAge` 60 s, `maxCommitmentAge` 24 h, `quarantinePeriod` 90 d,
`changeCooldown` 30 d, `repointDelay` 48 h, `lapseGrace` 365 d. Stored as admin-settable
uints with hard-coded sane bounds (e.g. repointDelay ∈ [24 h, 14 d]; quarantine ∈ [30 d,
365 d]) so tuning never requires an upgrade but can't silently disable a protection.

**Rationale**: The spec explicitly calls these tunable policy parameters; bounded setters
keep the constitution's access-control story clean (an admin key compromise cannot zero-out
the takeover protections).

**Alternatives considered**: Constants (rejected: tuning would need upgrades); unbounded
setters (rejected: converts an admin-key compromise into a protection bypass).
