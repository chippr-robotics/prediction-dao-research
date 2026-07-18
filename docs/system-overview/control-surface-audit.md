# Platform Control-Surface Audit & Operations Control Plane

**Date:** 2026-07-18 · **Scope:** every administrative/operator control on the
platform — on-chain contracts, off-chain services, and the frontend admin panel
— plus the gap analysis that drove the admin panel's consolidation into an
operations control plane.

This document is the inventory of record. The panel itself lives at `/admin`
(`frontend/src/components/AdminPanel.jsx`); how to operate each view is in
[the control plane runbook](../runbooks/operations-control-plane.md), operator
personas and grants are in
[operator onboarding](../runbooks/operator-onboarding.md), and per-system
procedure detail stays in `docs/runbooks/`.

---

## 1. Control-surface inventory

### 1.1 On-chain roles and who holds what

| Role | Contract(s) | Authority | Operator persona |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | all UUPS contracts, SanctionsGuard | config, wiring, treasury withdrawal, role admin | Protocol Administrator (floppy keystore) |
| `UPGRADER_ROLE` | all `UUPSManaged` adopters | UUPS upgrades + `setIntentExtension` (upgrade-equivalent) | Release Engineer (floppy keystore) |
| `GUARDIAN_ROLE` | WagerRegistry | `pause()` / `unpause()` | Incident Commander |
| `ACCOUNT_MODERATOR_ROLE` | WagerRegistry | `freezeAccount` / `unfreezeAccount` | Trust & Safety |
| `ROLE_MANAGER_ROLE` | MembershipManager | grant/revoke memberships out-of-band | Member Support |
| `SANCTIONS_ADMIN_ROLE` | SanctionsGuard | discretionary deny-list (`setDenied`) | Compliance Officer |
| `TOKEN_ISSUER_ROLE` | TokenFactory | token issuance entrypoints | Token Operations |
| `REGISTRY_CURATOR_ROLE` / `MODERATOR_ROLE` / `VERIFIER_ROLE` | CallsignRegistry | reserve / suspend / verify callsigns | Identity Moderation |
| `Ownable` owner | oracle adapters, FairWinsVerifyingPaymaster | oracle condition config; paymaster deposit/signer | Oracle Operator / Paymaster Operator |

### 1.2 On-chain admin functions (by contract)

- **WagerRegistry** (UUPS, pausable): `pause`/`unpause` (GUARDIAN),
  `freezeAccount`/`unfreezeAccount` (ACCOUNT_MODERATOR), `setMembershipManager`,
  `setPolymarketAdapter`, `setSanctionsGuard`, `setOracleAdapter(type, addr)`,
  `setTokenAllowed(token, bool)` (all DEFAULT_ADMIN), `setIntentExtension`
  (UPGRADER). Readouts: `paused()`, `isFrozen`, `isTokenAllowed`,
  `membershipManager()`, `polymarketAdapter()`, `sanctionsGuard()`,
  `oracleAdapters(type)`, `intentExtension()`.
- **WagerRegistryIntents** (facet, same proxy): `setFeeNetting` (DEFAULT_ADMIN);
  **permissionless maintenance**: `batchExpireOpen(uint256[])`,
  `autoResolveFromPolymarket(id)`, `autoResolveFromOracle(id)`.
- **MembershipManager** (UUPS): `setTier`, `setTreasury`, `setPaymentToken`,
  `setAuthorizedCaller`, `setSanctionsGuard`, `setVoucher`, `setFeeNetting`,
  `withdrawFees` (all DEFAULT_ADMIN); `grantMembership`/`revokeMembership`
  (ROLE_MANAGER).
- **SanctionsGuard** (non-upgradeable): `setDenied` (SANCTIONS_ADMIN),
  `setSanctionsOracle` (DEFAULT_ADMIN; `address(0)` disables oracle screening —
  deny-list still applies).
- **CallsignRegistry** (UUPS): `setReserved` (CURATOR), `setSuspended`
  (MODERATOR), `setVerified` (VERIFIER), `setPolicyParams` (bounded),
  `setMembershipGate` (floored at Gold), `setMembershipManager`,
  `setSanctionsGuard` (DEFAULT_ADMIN).
- **WagerPoolFactory** (UUPS): `setTemplate`, `setAllowedToken`,
  `setSanctionsGuard`, `setMembershipManager` (DEFAULT_ADMIN).
- **TokenFactory** (UUPS): `setTemplate`/`setV2Template`, `setSanctionsGuard`
  (DEFAULT_ADMIN); `create*` (TOKEN_ISSUER).
- **FairWinsVerifyingPaymaster** (Ownable): `deposit()` (permissionless
  top-up), `getDeposit()`, `withdrawTo` (owner), `setVerifyingSigner` (owner),
  `addStake`/`unlockStake`/`withdrawStake` (owner).
- **Oracle adapters** (Ownable): Chainlink Data Feed `setFeedAllowed`,
  `registerCondition`, `linkMarket`; Chainlink Functions `registerCondition`,
  `linkMarket`; UMA `registerCondition`, `linkMarket`; Polymarket
  `addCTFContract`/`removeCTFContract`/`updatePrimaryCTF`,
  `linkMarketToPolymarket*`, `unlinkMarket`.
- **No admin surface by design** (funds can never be drained or redirected by
  an operator): `WagerPool` clones, `MembershipVoucher` (royalty bps only),
  `VoucherBatchMinter`, `KeyRegistry`, `BackupPointerRegistry`,
  `SafeProposalHub`, `SafePolicyGuard` (the Safe itself is the only authority).

### 1.3 Off-chain / service controls (relay-gateway, oz-relayer, alto)

All are env/config/signal-driven — the gateway deliberately has **no remote
admin API** (worst case is refusing gas; it can censor, never steal):

- **Gateway killswitch**: `KILL_SWITCH` env or `kill -USR2 <pid>`; halts
  intents, paymaster sponsorship, OpenSea and Polymarket proxy routes. All
  flows degrade to client self-submit (never-stranded rule).
- **Quotas / backpressure / spend caps**: `SIGNER_QUOTA_PER_MIN`,
  `GLOBAL_QUOTA_PER_MIN`, `MAX_QUEUE_DEPTH`, `GAS_SPEND_CAP_WEI_<id>`,
  `PM_*` paymaster ceilings — env only.
- **Polymarket builder fee**: `POLYMARKET_BUILDER_*` env, hard caps enforced at
  boot (100/50 bps); fee changes rate-limited by Polymarket (1 per 7 days).
- **oz-relayer**: per-chain `paused`, `gas_price_cap`, `whitelist_receivers`,
  `min_balance` in `services/oz-relayer/config/config.json` + restart.
- **Telemetry**: gateway `GET /status` returns `{status, chains: {<id>:
  {rpc, gasWalletRunwayHrs, paymasterDepositRunwayHrs}}, killSwitch}` —
  operator fields disclosed only with a valid `X-Origin-Auth` header (injected
  zone-wide by Cloudflare in production).
- **CLI scripts** (floppy-signed where they mutate state): `scripts/admin/*`
  (roles, tier pricing, treasury limits), `scripts/operations/*` (lockdown,
  fee netting, relayer funding), `scripts/deploy/*` (upgrades, storage-layout
  gate), `scripts/cron/*` (funding settlement + health checks).

---

## 2. Gap analysis — controls that had no admin-panel surface

The pre-consolidation panel covered: pause/unpause, tier config,
membership grant/revoke, freeze/unfreeze, four admin roles, fee withdrawal,
three oracle adapters, deny-list, callsigns. Everything below was **invisible
or unreachable from the panel**:

| # | Gap | Severity | Disposition |
|---|---|---|---|
| G1 | Protocol wiring (`setOracleAdapter`, `setSanctionsGuard`, `setMembershipManager`, `setPolymarketAdapter`, stake-token allowlist, `setTreasury`, `setPaymentToken`, `setAuthorizedCaller`, `setSanctionsOracle`) had no UI and **no readout** — an operator could not even verify current wiring | High | **Built** — Protocol Config view (readout + admin-gated setters) |
| G2 | Paymaster operations (deposit runway = the loss cap per spec 050; `deposit`, `withdrawTo`, `setVerifyingSigner`) were CLI-only; deposit balance not visible anywhere | High | **Built** — Paymaster card in Infrastructure view; `verifyingPaymaster` added to the frontend address book |
| G3 | Gateway/relayer health (killswitch state, per-chain RPC, gas-wallet runway, paymaster runway) never surfaced to operators despite `/status` existing | High | **Built** — Service Health card (Overview + Infrastructure), read-only by design |
| G4 | Maintenance sweeps (`batchExpireOpen`, `autoResolveFrom*`) — permissionless, but no surface to run them | Medium | **Built** — Maintenance view |
| G5 | `SANCTIONS_ADMIN_ROLE` existed on-chain but not in the frontend role model; the deny-list tab was gated on DEFAULT_ADMIN instead of the actual role, so a compliance officer without full admin could not reach their own tool | Medium | **Built** — `SANCTIONS_ADMIN` added to the role model; Compliance group gated on it |
| G6 | Role management could not grant/revoke `SANCTIONS_ADMIN_ROLE` (SanctionsGuard) or `TOKEN_ISSUER_ROLE` (TokenFactory) | Medium | **Built** — Admin Roles view extended, role→contract routing made explicit |
| G7 | Pool/token factory config (`setTemplate`, `setAllowedToken`, `setV2Template`) has no UI | Low | **Documented** — template swaps are deploy-coupled (new implementation address); keep on the scripted path (`scripts/deploy/set-pool-template.js`), where the storage-layout gate lives |
| G8 | Gateway killswitch/quotas cannot be *toggled* from a browser | By design | **Documented** — the gateway has no admin API on purpose (an authenticated web killswitch would be a new attack surface); panel shows state + links the runbook |
| G9 | `NullifierTab` is orphaned dead code targeting the **legacy v1** market factory; `RoleManagementAdmin.css` is a stranded stylesheet | Low | **Documented** — recommend removal or a v2 migration spec; not re-wired (would resurrect a legacy surface) |
| G10 | Oracle admin lacks the Polymarket adapter (`addCTFContract`, `linkMarketToPolymarket`, `unlinkMarket`) | Low | **Deferred** — adapter is Ownable by the deploy EOA; follow-up alongside an ownership-to-role migration |

---

## 3. The operations control plane

The `/admin` route is now a grouped control plane (`PortalNav` grouped rail).
Each view is still gated by the on-chain role it requires; a group only renders
if the operator holds at least one role inside it.

| Group | Views | Gate |
|---|---|---|
| **Control Room** | Overview (protocol + service status tiles, membership/treasury metrics, contract addresses) | any operator role |
| **Incident Response** | Emergency (pause/unpause + gateway killswitch readout), Account Moderation (freeze/unfreeze) | GUARDIAN / ACCOUNT_MODERATOR |
| **Compliance** | Deny-list | SANCTIONS_ADMIN or ADMIN |
| **Membership & Revenue** | Tiers, Members, Treasury | ADMIN / ROLE_MANAGER |
| **Protocol Config** | Wiring & Tokens, Oracle Adapters, Maintenance | ADMIN (Maintenance: any operator — the calls are permissionless) |
| **Identity** | Callsigns | ADMIN (per-action roles inside) |
| **Access Control** | Admin Roles | ADMIN |
| **Infrastructure** | Services (gateway health, relayer runway, paymaster ops) | ADMIN / GUARDIAN |

Positive control is demonstrated by the Control Room: one screen answering
"is the protocol live, is the gateway live, is sponsorship funded, is anything
paused or killswitched, and who am I signed in as with which powers".

### Operator role recommendations

Current on-chain roles are sufficient — no new roles need deploying. What
changed is that the frontend now models all of them:

1. **Compliance Officer** = `SANCTIONS_ADMIN_ROLE` (now a first-class panel
   role; grant via Admin Roles → SanctionsGuard).
2. **Token Operations** = `TOKEN_ISSUER_ROLE` (grantable from the panel;
   issuance UI remains a follow-up).
3. Future candidates (documented, not built): a **Treasurer** split
   (`withdrawFees` today requires full DEFAULT_ADMIN — a dedicated
   `TREASURER_ROLE` would need a contract upgrade) and role-based ownership of
   the oracle adapters (currently single-owner EOAs).

### Explicitly out of the control plane

- Anything requiring the floppy keystore (upgrades, `UPGRADER_ROLE` actions)
  — air-gapped by policy; see `docs/runbooks/contract-upgrades.md`.
- Gateway env/config mutation (killswitch toggle, quotas, builder fee) — see
  `docs/runbooks/relayer-operations.md`.
- Legacy v1 (`FriendGroupMarketFactory`, nullifier registry) — no live network
  configures it.
