# Runbook: Callsign Registry — deploy & operations (spec 054)

How to deploy and operate the **CallsignRegistry** — the in-house `%callsign` naming
registry. This covers the targeted deploy, wiring the frontend, granting operator
roles, day-to-day moderation, policy tuning, monitoring, and upgrades.

Background: [developer-guide/callsigns.md](../developer-guide/callsigns.md) (design +
lifecycle). End-user behaviour: [user-guide/callsigns.md](../user-guide/callsigns.md).
The registry is a UUPS proxy, so **changing its logic later is an in-place upgrade**,
not a re-run of the deploy script — see [contract-upgrades.md](./contract-upgrades.md).

> **What it is.** A single UUPS proxy (`UUPSManaged` + `SignerIntentBase`) that maps a
> normalized `%callsign` to an owner address. It holds **no funds**, has its **own**
> AccessControl (separate from the main registry), and gates registration on **Gold
> membership** (`WAGER_PARTICIPANT_ROLE`) via the shared `MembershipManager` +
> `SanctionsGuard`.

## Deploy

### Prerequisites

- **Admin key** — mount the floppy keystore so the deployer (who becomes
  `DEFAULT_ADMIN_ROLE` / `UPGRADER_ROLE`) can sign:
  ```bash
  npm run floppy:mount
  ```
  Falls back to `.env` `PRIVATE_KEY` only when the floppy isn't mounted.
- **RPC + gas** — a working, post-upgrade RPC for the target network and native gas for
  the deployer. Pin gas where needed (e.g. `GAS_PRICE_WEI=100000000000` on Mordor).
- **Existing deployment record** — `deployments/<net>-chain<id>-v2.json` must already
  exist with a `membershipManager` (the script aborts otherwise — the Gold gate needs
  it). `sanctionsGuard` is optional; when absent, screening is disabled (e.g. Mordor
  without a Chainalysis oracle).

### Pre-flight

```bash
npm run compile
npm run check:storage-layout      # the registry is UUPS — validate append-only storage (CI-gated)
npm test                          # test/callsignRegistry*.test.js + integration must pass
```

### Run the deploy

The deploy is **targeted and append-only** — it reuses the recorded
`membershipManager` + `sanctionsGuard`, deploys the proxy, seeds the reserved list from
`config/reserved-callsigns.json`, and **appends** `callsignRegistry` /
`callsignRegistryImpl` to the existing record. It never touches the live core proxies.

```bash
# Mordor (ETC testnet)
GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-callsign-registry.js --network mordor

# Polygon mainnet
npx hardhat run scripts/deploy/deploy-callsign-registry.js --network polygon
```

Re-running after `callsignRegistry` is recorded **aborts by design** (use an upgrade to
change logic). The reserved-term seeding self-grants `REGISTRY_CURATOR_ROLE` to the
deployer, batches `setReserved`, and logs the count.

### Post-deploy

```bash
npm run sync:frontend-contracts   # populates the callsignRegistry address in frontend config
npm run verify:<net>              # verify the impl on the explorer (network-aware)
```

Confirm the appended `callsignRegistry` / `callsignRegistryImpl` in
`deployments/<net>-chain<id>-v2.json`, and that the frontend now resolves the address
(`getContractAddressForChain('callsignRegistry', chainId)`). Until this sync lands, the
admin screen and all callsign resolution show a "not configured on this network" state.

## Operator roles

The registry has its own AccessControl. The deployer holds `DEFAULT_ADMIN_ROLE`. Three
operator roles gate the work:

| Role | Can |
|------|-----|
| `REGISTRY_CURATOR_ROLE` | Reserve / unreserve terms (`setReserved`) |
| `MODERATOR_ROLE` | Suspend / unsuspend a callsign (`setSuspended`) |
| `VERIFIER_ROLE` | Set / clear the verification badge (`setVerified`) |
| `DEFAULT_ADMIN_ROLE` | Policy params, membership gate, and granting the above |

Grant them to your operators from the admin screen (below) or directly. Follow
least-privilege: give moderators only `MODERATOR_ROLE`, not admin.

## Operate: the control plane's Callsigns view

Everything below is a role-gated write from `/admin` → **Identity →
Callsigns** in the operations control plane (component
`frontend/src/components/admin/CallsignRegistryAdmin.jsx`). Each control is enabled only if
your connected wallet holds the matching role **on this contract** (read live via
`hasRole`). Writes go through the standard admin `runTx` (plain signer — admin actions
are not gasless).

- **Metrics** — registry-wide counts, the current suspended / verified / reserved
  lists, and a recent-activity feed. There are no on-chain counters and no subgraph, so
  this is a **bounded client-side event scan** (a recent-block lookback with an explicit
  **Refresh**, a short TTL cache, and an honest "recent window only" banner). For
  complete historical totals, add a subgraph `Callsign` entity (future work).
- **Moderation** — look up a `%callsign` → see live status/owner/verified/reserved → then:
  - **Suspend** (MODERATOR): stops the callsign resolving/displaying. **Never** reassigns the
    callsign or moves funds; the owner keeps ownership and all other functionality.
  - **Verify** (VERIFIER): grants the verification badge after your off-chain review.
  - **Reserve** (CURATOR): blocks a term from registration.
- **Policy** (ADMIN) — `setPolicyParams` within the on-chain bounds, plus the membership
  gate tier (hard-floored at Gold).
- **Roles** (ADMIN) — grant/revoke CURATOR / MODERATOR / VERIFIER by address.

## Policy parameters (bounds)

`setPolicyParams(minCommitmentAge, maxCommitmentAge, quarantinePeriod, changeCooldown,
repointDelay, lapseGrace)` — all in **seconds**, each validated on-chain:

| Param | Default | Bounds |
|-------|---------|--------|
| `minCommitmentAge` | 1 minute | 1 min – 1 day |
| `maxCommitmentAge` | 1 day | > min, ≤ 7 days |
| `quarantinePeriod` | 90 days | 30 – 365 days |
| `changeCooldown` | 30 days | 1 – 365 days |
| `repointDelay` | 48 hours | 24 h – 14 days |
| `lapseGrace` | 365 days | 30 – 3650 days |

`setMembershipGate(role, tier)` cannot drop the minimum tier below **Gold**. An
out-of-bounds value reverts (`ParamOutOfBounds` / `TierBelowFloor`); the admin screen
pre-validates and shows the human-readable equivalent before you submit.

## Incident response

- **Impersonation / abuse report** — users file reports via the in-app **Report** link
  (a pre-filled `mailto:` to the operator inbox; there is no on-chain report path). On a
  confirmed report:
  - **Suspend** the offending callsign (MODERATOR). This is the primary lever: it stops
    resolution/display immediately, reassigns nothing, and touches no funds. Reverse
    with the same control once resolved.
  - If a whole term should never be claimable, **Reserve** it (CURATOR).
- **Verification** — only set `setVerified` after a real off-chain identity review.
  Remember a verified badge is cleared automatically if the callsign is ever repointed to a
  new owner (re-verify the new owner if warranted).
- **What you cannot (and must not try to) do** — there is **no code path** to move a callsign
  to a different wallet on the owner's behalf, or to seize funds. Repointing is
  owner-authorized only.

## Monitoring

- Use the **Metrics** panel's Refresh for on-demand counts and the recent-activity feed.
  It's an operator-only, explicit-refresh scan — not an auto-poller — to stay within
  public-RPC `eth_getLogs` limits.
- The scan is a bounded backward lookback; when the window is capped it flags the tally
  as "recent window only." A subgraph `Callsign` entity is the path to complete history.

## Upgrades

The registry is a UUPS proxy with **append-only** storage and a trailing `__gap`.

```bash
npm run check:storage-layout      # must pass before any upgrade (CI-gated)
```

Ship logic changes as an **in-place upgrade** (`scripts/deploy/lib/upgradeable.js`
`upgradeProxy`) — never a fresh redeploy, which would strand every registered callsign. See
[contract-upgrades.md](./contract-upgrades.md). `deployments/<net>-chain<id>-v2.json`
records the proxy (`callsignRegistry`) and current implementation
(`callsignRegistryImpl`).

## Reserved-list curation

`config/reserved-callsigns.json` is the **initial** seed only (platform/brand names,
operational terms). Terms must already be canonical (3–20 chars, lowercase `a–z0–9`,
single interior hyphens) or they can't collide with a registrable callsign. Curate additively
on-chain with `setReserved` (CURATOR) — via the admin screen or directly.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Callsigns view shows "not deployed / configured on this network" | Address not synced. Run `npm run sync:frontend-contracts` after deploy. |
| A moderation button is disabled | Your wallet lacks that role on this contract. Have an admin grant CURATOR/MODERATOR/VERIFIER. |
| Deploy aborts "already recorded" | `callsignRegistry` is already in the record — use an upgrade, not this script. |
| Deploy aborts "No membershipManager" | The network's `-v2.json` record has no `membershipManager`; deploy the core stack first. |
| `setPolicyParams` reverts | A value is outside its bound (see the table) or `maxCommitmentAge ≤ minCommitmentAge`. |
| Metrics show "recent window only" | Expected — the event scan is a bounded lookback. Query the chain (or a future subgraph) for full history. |

## References

- Design: [developer-guide/callsigns.md](../developer-guide/callsigns.md)
- End users: [user-guide/callsigns.md](../user-guide/callsigns.md)
- Upgrades: [contract-upgrades.md](./contract-upgrades.md)
- Sister feature (pools) deploy: [zk-wager-pools-deploy.md](./zk-wager-pools-deploy.md)
- Spec: `specs/054-callsign-registry/`
