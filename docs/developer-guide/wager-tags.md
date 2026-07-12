# Wager tags — the in-house naming registry (spec 054)

A **wager tag** is an optional, memorable handle a member can register and display with a `%`
prefix (e.g. `%chipprbots`). It gives the platform a predictable, in-house identity primitive for
fast lookup and address entry across pools, wagers, and the address book — the same role ENS plays,
but tied to FairWins membership and resolved trustlessly on-chain.

Tags are a **Gold-tier-and-above perk** and are **completely optional**: nothing on the value path
requires one. A member can create, accept, and settle any wager with a raw address forever without
touching the registry.

- Contract: `contracts/naming/WagerTagRegistry.sol` (interface `contracts/interfaces/IWagerTagRegistry.sol`)
- Spec: [`specs/054-wager-tag-registry/`](../../specs/054-wager-tag-registry/)
- Related: [upgradeable-contracts.md](./upgradeable-contracts.md), [gasless-intents.md](./gasless-intents.md)

## Design at a glance

| Property | Choice | Why |
|----------|--------|-----|
| Source of truth | On-chain UUPS proxy (`UUPSManaged`) | Trustless resolution + role-based moderation, like the platform's other primitives |
| Eligibility | `getActiveTier(user, WAGER_PARTICIPANT_ROLE) >= Gold` | Membership-gated perk; the only user-purchasable role is `WAGER_PARTICIPANT_ROLE` |
| Optionality | Never read on any wager/pool value path | A tag is a convenience, not a requirement (FR-001a) |
| Anti-snipe | ENS-style commit → reveal | A pending pick cannot be front-run |
| Canonical form | 3–20 chars, `a-z0-9` + single interior hyphen, lowercased | Homoglyph/confusable defense; keccak256-keyed |
| Resolution | Exact-match only; reverse guarded by forward==reverse | Never a near-match substitution (SC-005); reverse never lies (FR-008) |
| Gasless | Every actor action has an EIP-712 `…WithSig` twin | Relayer-ready via `SignerIntentBase`; self-submit always works |

The registry is **not** coupled to `WagerRegistry` or pools — it is a standalone identity map. Display
and address-entry surfaces read it opportunistically and **soft-fail** to raw addresses / ENS when it
is undeployed or unreachable.

## Lifecycle & statuses

`TagStatus`: `NONE · ACTIVE · REPOINTING · QUARANTINED · SUSPENDED · LAPSED_RECLAIMABLE`.

- **Register** — `makeCommitment` → `commit` → (wait `minCommitmentAge`) → `register`. Guards: canonical,
  not reserved, not already registered, not quarantined, caller holds no tag, Gold+, not sanctioned.
- **Change** — `changeTag` (release-old + register-new) rate-limited by `changeCooldown`.
- **Release** — `release` puts the name into a `quarantinePeriod` during which **no one** (including the
  former owner) can re-register it.
- **Repoint** (move a tag to a fresh wallet) — `requestRepoint` → `REPOINTING` for `repointDelay` →
  `finalizeRepoint` (permissionless after the delay) or `cancelRepoint`. During `REPOINTING` the tag is
  **not usable for value**. Repointing is tier-exempt (a downgraded owner can still migrate), and
  `finalizeRepoint` resets the lapse anchor so a fresh, un-membered wallet is not instantly reclaimable.
- **Lapse** — `reclaimLapsed(tagHash)` is permissionless but only succeeds when the owner's coverage is
  below Gold **and** `now > expiresAt + lapseGrace`. An active-but-downgraded membership keeps the tag
  `ACTIVE` until its term ends (honest, observable state — constitution III).
- **Moderation** — `setReserved` (CURATOR), `setSuspended` (MODERATOR), `setVerified` (VERIFIER).
  Suspension stops resolution/display but **never** reassigns the tag or touches funds.

### Policy defaults (all bounded & operator-tunable via `setPolicyParams`)

| Param | Default | Bounds |
|-------|---------|--------|
| `minCommitmentAge` | 1 minute | 1 min – 1 day |
| `maxCommitmentAge` | 1 day | > min, ≤ 7 days |
| `quarantinePeriod` | 90 days | 30 – 365 days |
| `changeCooldown` | 30 days | 1 – 365 days |
| `repointDelay` | 48 hours | 24 h – 14 days |
| `lapseGrace` | 365 days | 30 – 3650 days |

`minTier` is hard-floored at Gold — `setMembershipGate` cannot drop it below Gold.

Roles: `REGISTRY_CURATOR_ROLE`, `MODERATOR_ROLE`, `VERIFIER_ROLE`, plus the inherited `UPGRADER_ROLE` /
`DEFAULT_ADMIN_ROLE` from `UUPSManaged`.

## Frontend surfaces

| Concern | Where |
|---------|-------|
| Normalize/validate (mirrors on-chain rules) | `frontend/src/lib/tags/normalizeTag.js` |
| Forward/reverse resolution (soft-fail) | `frontend/src/lib/tags/resolveTag.js` |
| Reverse lookup hook (short-TTL cache) | `frontend/src/hooks/useWagerTag.js` |
| Forward resolution for address entry | `frontend/src/hooks/useTagResolution.js` |
| Account management UI (Gold-gated) | `frontend/src/components/account/WagerTagPanel.jsx` (Wallet → Membership tab) |
| Address entry (`%tag` → owner + confirm) | `frontend/src/components/ui/AddressInput.jsx` |
| Display-name priority | `frontend/src/hooks/useOpponentName.js` — **address book > wager tag > ENS > generated** |
| Verification badge + abuse report | `AddressInput` preview + `frontend/src/components/tags/ReportTagButton.jsx` |
| Hand-maintained ABI | `frontend/src/abis/wagerTagRegistry.js` |

Only an `ACTIVE` tag is committable in address entry; every other status surfaces an honest,
non-committable message. FairWins runs no app backend, so abuse reports route to the operator
moderation inbox via a pre-filled `mailto:` (no on-chain report path exists).

## Gasless intents (three-way sync)

The EIP-712 structs (`CommitTagIntent`, `RegisterTagIntent`, `ChangeTagIntent`, `ReleaseTagIntent`,
`RequestRepointIntent`, `CancelRepointIntent`) must stay **byte-identical** across:

1. the contract typehashes (`WagerTagRegistry.sol`),
2. `frontend/src/lib/relay/intentTypes.js`,
3. `services/relay-gateway/src/intent/intentTypes.js`.

Domain: `name = "FairWins WagerTagRegistry"`, `version = "1"`. `finalizeRepoint` and `reclaimLapsed`
are permissionless and need no signed twin. Every gasless action keeps a self-submit fallback.

## Deploy & upgrade

```bash
# Deploy the UUPS proxy + seed the reserved list from config/reserved-tags.json
npx hardhat run scripts/deploy/deploy-wager-tag-registry.js --network <network>

# Storage-layout / upgrade-safety gate (the wagerTagRegistry pair is registered)
npm run check:storage-layout
```

Recorded in `deployments/<network>.json` as `wagerTagRegistry` / `wagerTagRegistryImpl`. Resolve the
address in app/scripts via `getContractAddressForChain('wagerTagRegistry', chainId)`. Storage is
append-only with a trailing `__gap`; ship logic changes as in-place upgrades, never a fresh redeploy.

## Testing

- Contract: `test/wagerTagRegistry.test.js` (register/resolve/lifecycle/moderation) +
  `test/wagerTagRegistry.intents.test.js` (gasless twins).
- Integration: `test/integration/wagerTagRegistry.membership.test.js` — Gold gate against a real
  `MembershipManager`, and a tagless below-Gold account completing a full wager (FR-001a / SC-011).
- Frontend: `frontend/src/lib/tags/__tests__/`, `frontend/src/test/AddressInput.tag.test.jsx`,
  `ReportTagButton.test.jsx`, `useOpponentName.test.jsx`, and axe assertions in `wagerTags.axe.test.jsx`.
