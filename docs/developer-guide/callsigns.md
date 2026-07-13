# Callsigns — the in-house naming registry (spec 054)

A **callsign** is an optional, memorable handle a member can register and display with a `%`
prefix (e.g. `%chipprbots`). It gives the platform a predictable, in-house identity primitive for
fast lookup and address entry across pools, wagers, and the address book — the same role ENS plays,
but tied to FairWins membership and resolved trustlessly on-chain.

Callsigns are a **Gold-tier-and-above perk** and are **completely optional**: nothing on the value path
requires one. A member can create, accept, and settle any wager with a raw address forever without
touching the registry.

- Contract: `contracts/naming/CallsignRegistry.sol` (interface `contracts/interfaces/ICallsignRegistry.sol`)
- Spec: [`specs/054-callsign-registry/`](../../specs/054-callsign-registry/)
- Operator runbook (deploy + moderate + monitor): [runbooks/callsigns-operations.md](../runbooks/callsigns-operations.md)
- End-user guide: [user-guide/callsigns.md](../user-guide/callsigns.md)
- Related: [upgradeable-contracts.md](./upgradeable-contracts.md), [gasless-intents.md](./gasless-intents.md)

## Design at a glance

| Property | Choice | Why |
|----------|--------|-----|
| Source of truth | On-chain UUPS proxy (`UUPSManaged`) | Trustless resolution + role-based moderation, like the platform's other primitives |
| Eligibility | `getActiveTier(user, WAGER_PARTICIPANT_ROLE) >= Gold` | Membership-gated perk; the only user-purchasable role is `WAGER_PARTICIPANT_ROLE` |
| Optionality | Never read on any wager/pool value path | A callsign is a convenience, not a requirement (FR-001a) |
| Anti-snipe | ENS-style commit → reveal | A pending pick cannot be front-run |
| Canonical form | 3–20 chars, `a-z0-9` + single interior hyphen, lowercased | Homoglyph/confusable defense; keccak256-keyed |
| Resolution | Exact-match only; reverse guarded by forward==reverse | Never a near-match substitution (SC-005); reverse never lies (FR-008) |
| Gasless | Every actor action has an EIP-712 `…WithSig` twin | Relayer-ready via `SignerIntentBase`; self-submit always works |

The registry is **not** coupled to `WagerRegistry` or pools — it is a standalone identity map. Display
and address-entry surfaces read it opportunistically and **soft-fail** to raw addresses / ENS when it
is undeployed or unreachable.

## Lifecycle & statuses

`CallsignStatus`: `NONE · ACTIVE · REPOINTING · QUARANTINED · SUSPENDED · LAPSED_RECLAIMABLE`.

- **Register** — `makeCommitment` → `commit` → (wait `minCommitmentAge`) → `register`. Guards: canonical,
  not reserved, not already registered, not quarantined, caller holds no callsign, Gold+, not sanctioned.
- **Change** — `changeCallsign` (release-old + register-new) rate-limited by `changeCooldown`.
- **Release** — `release` puts the name into a `quarantinePeriod` during which **no one** (including the
  former owner) can re-register it.
- **Repoint** (move a callsign to a fresh wallet) — `requestRepoint` → `REPOINTING` for `repointDelay` →
  `finalizeRepoint` (permissionless after the delay) or `cancelRepoint`. During `REPOINTING` the callsign is
  **not usable for value**. Requesting is tier-exempt (a downgraded owner isn't stranded), but
  `finalizeRepoint` requires the **incoming** owner to be Gold-eligible before the callsign moves (so a
  non-member can't ring-repoint to reset the lapse anchor and hoard names — FR-021), re-stamps the lapse
  anchor, and **clears the `verified` marker** so verification never rides along to a new owner.
- **Lapse** — `reclaimLapsed(callsignHash)` is permissionless but only succeeds when the owner's coverage is
  below Gold **and** `now > expiresAt + lapseGrace`. An active-but-downgraded membership keeps the callsign
  `ACTIVE` until its term ends (honest, observable state — constitution III).
- **Moderation** — `setReserved` (CURATOR), `setSuspended` (MODERATOR), `setVerified` (VERIFIER).
  Suspension stops resolution/display but **never** reassigns the callsign or touches funds.

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
| Normalize/validate (mirrors on-chain rules) | `frontend/src/lib/callsigns/normalizeCallsign.js` |
| Forward/reverse resolution (soft-fail) | `frontend/src/lib/callsigns/resolveCallsign.js` |
| Reverse lookup hook (short-TTL cache) | `frontend/src/hooks/useCallsign.js` |
| Forward resolution for address entry | `frontend/src/hooks/useCallsignResolution.js` |
| Account management UI (Gold-gated) | `frontend/src/components/account/CallsignPanel.jsx` (Wallet → Membership tab) |
| Address entry (`%callsign` → owner + confirm) | `frontend/src/components/ui/AddressInput.jsx` |
| Display-name priority | `frontend/src/hooks/useOpponentName.js` — **address book > callsign > ENS > generated** |
| Verification badge + abuse report | `AddressInput` preview + `frontend/src/components/callsigns/ReportCallsignButton.jsx` |
| Operator admin (moderation/policy/roles/metrics) | `frontend/src/components/admin/CallsignRegistryAdmin.jsx` (AdminPanel → "Callsigns" tab) + `frontend/src/hooks/useCallsignRegistryMetrics.js` |
| Hand-maintained ABI | `frontend/src/abis/callsignRegistry.js` |

Only an `ACTIVE` callsign is committable in address entry; every other status surfaces an honest,
non-committable message. FairWins runs no app backend, so abuse reports route to the operator
moderation inbox via a pre-filled `mailto:` (no on-chain report path exists).

## Operator admin

The **Callsigns** tab in the platform AdminPanel (`/admin`) is the operator console. The registry has
its **own** AccessControl (separate from the main registry), so the tab reads `hasRole` directly from the
callsign contract and gates each control on the caller's role there:

- **Metrics** — registry-wide counts + current suspended/verified/reserved lists + a recent-activity feed,
  derived from a bounded client-side event scan (`useCallsignRegistryMetrics`, reusing `getLogsRange`). There are
  no on-chain counters and no subgraph, so the scan is a MAX_SPAN backward lookback with an explicit Refresh,
  a TTL cache, and an honest "recent window only" banner when truncated. A future subgraph `Callsign` entity is
  the path to complete historical totals.
- **Moderation** — look up a `%callsign`, then `setSuspended` (MODERATOR), `setVerified` (VERIFIER), or
  `setReserved` (CURATOR). None of these ever reassigns a callsign or moves funds.
- **Policy** (DEFAULT_ADMIN) — `setPolicyParams` within the on-chain bounds + `setMembershipGate`
  (hard-floored at Gold).
- **Roles** (DEFAULT_ADMIN) — grant/revoke CURATOR/MODERATOR/VERIFIER by address.

All writes use the AdminPanel's plain-signer `runTx` (admin actions are not gasless). Until the registry is
deployed and synced (`callsignRegistry` address in `contracts.js`), the tab shows a "not configured" notice.

## Gasless intents (three-way sync)

The EIP-712 structs (`CommitCallsignIntent`, `RegisterCallsignIntent`, `ChangeCallsignIntent`, `ReleaseCallsignIntent`,
`RequestRepointIntent`, `CancelRepointIntent`) must stay **byte-identical** across:

1. the contract typehashes (`CallsignRegistry.sol`),
2. `frontend/src/lib/relay/intentTypes.js`,
3. `services/relay-gateway/src/intent/intentTypes.js`.

Domain: `name = "FairWins CallsignRegistry"`, `version = "1"`. `finalizeRepoint` and `reclaimLapsed`
are permissionless and need no signed twin. Every gasless action keeps a self-submit fallback.

## Deploy & upgrade

```bash
# Deploy the UUPS proxy + seed the reserved list from config/reserved-callsigns.json
npx hardhat run scripts/deploy/deploy-callsign-registry.js --network <network>

# Storage-layout / upgrade-safety gate (the callsignRegistry pair is registered)
npm run check:storage-layout
```

Recorded in `deployments/<network>.json` as `callsignRegistry` / `callsignRegistryImpl`. Resolve the
address in app/scripts via `getContractAddressForChain('callsignRegistry', chainId)`. Storage is
append-only with a trailing `__gap`; ship logic changes as in-place upgrades, never a fresh redeploy.

## Testing

- Contract: `test/callsignRegistry.test.js` (register/resolve/lifecycle/moderation) +
  `test/callsignRegistry.intents.test.js` (gasless twins).
- Integration: `test/integration/callsignRegistry.membership.test.js` — Gold gate against a real
  `MembershipManager`, and a tagless below-Gold account completing a full wager (FR-001a / SC-011).
- Frontend: `frontend/src/lib/callsigns/__tests__/`, `frontend/src/test/AddressInput.callsign.test.jsx`,
  `ReportCallsignButton.test.jsx`, `useOpponentName.test.jsx`, and axe assertions in `callsigns.axe.test.jsx`.
