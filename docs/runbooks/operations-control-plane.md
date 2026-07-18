# Runbook: The Operations Control Plane (`/admin`)

The operations control plane is the grouped operator console at `/admin`
(`frontend/src/components/AdminPanel.jsx`). It is where platform controls are
performed, metrics read, and positive control demonstrated. Every view is
gated by the on-chain role its actions require — a view (and its group) only
renders if the connected wallet holds that role.

All writes are **plain signer transactions** (operator actions are never
gasless). Addresses resolve per-chain via `getContractAddressForChain`; a view
soft-fails with an explanatory card when its contract is not deployed on the
connected network.

Related: [operator onboarding](operator-onboarding.md) ·
[control-surface audit](../system-overview/control-surface-audit.md) ·
[roles overview](../system-overview/roles-and-tiers.md)

## Map: groups, views, and gates

| Group | View | Requires | Acts on |
|---|---|---|---|
| Control Room | Overview | any operator role | read-only |
| Incident Response | Emergency | `GUARDIAN_ROLE` | WagerRegistry |
| Incident Response | Account Moderation | `ACCOUNT_MODERATOR_ROLE` | WagerRegistry |
| Compliance | Deny-list | `SANCTIONS_ADMIN_ROLE` (or admin) | SanctionsGuard |
| Membership & Revenue | Tiers | `DEFAULT_ADMIN_ROLE` | MembershipManager |
| Membership & Revenue | Members | `ROLE_MANAGER_ROLE` | MembershipManager |
| Membership & Revenue | Treasury | `DEFAULT_ADMIN_ROLE` | MembershipManager |
| Protocol Config | Wiring & Tokens | `DEFAULT_ADMIN_ROLE` | WagerRegistry, MembershipManager, SanctionsGuard |
| Protocol Config | Oracle Adapters | adapter `owner` | the three oracle adapters |
| Protocol Config | Maintenance | none (permissionless calls) | WagerRegistry (intents facet) |
| Identity | Callsigns | callsign registry roles | CallsignRegistry |
| Access Control | Admin Roles | `DEFAULT_ADMIN_ROLE` | role-defining contracts |
| Infrastructure | Services | admin or guardian | read-only + paymaster |

## How-to: common procedures

### Emergency-pause the protocol (Guardian)

1. `/admin` → **Incident Response → Emergency**.
2. Confirm the incident justifies a protocol-wide stop (see
   [security](../system-overview/security.md)); pausing halts wager creation,
   acceptance, and settlement. Draw/refund/claim exit paths stay open.
3. **Pause Protocol** → sign. The header status dot and Overview flip to
   *Paused* within one poll (≤30 s).
4. The same screen shows the gasless-infrastructure health card: a full stop
   is the on-chain pause **plus** the gateway killswitch — the latter is
   runbook-operated ([relayer-operations](relayer-operations.md)), not a
   button here, by design.
5. After remediation, **Unpause Protocol** from the same view.

### Freeze / unfreeze an account (Account Moderator)

1. `/admin` → **Incident Response → Account Moderation**.
2. Enter the address or ENS name and a **reason** — the reason is recorded
   on-chain in the `AccountFrozen` event and is mandatory. Grounds and the
   appeal path are in the
   [account moderation policy](../system-overview/account-moderation.md).
3. **Freeze Account** → sign. A frozen account cannot create, accept, cancel,
   declare, claim, or refund on WagerRegistry. Unfreeze from the same view.

### Deny-list an address (Compliance Officer)

1. `/admin` → **Compliance → Deny-list**.
2. Check current status first (the view reads `isDenied` / `isAllowed`).
3. Set denied with a written reason → sign. The audit trail table below the
   form is built from `DenyListUpdated` events.
4. Note the split of powers: the deny-list is `SANCTIONS_ADMIN_ROLE`; pointing
   the guard at a different Chainalysis oracle (or disabling oracle screening)
   is `DEFAULT_ADMIN_ROLE` under **Protocol Config → Wiring & Tokens**.

### Configure tiers, grant memberships, withdraw fees

- **Tiers** (admin): set price / duration / monthly + concurrent caps per
  tier; the active checkbox controls purchasability.
- **Members** (role manager): grant a membership out-of-band (support, gifts,
  dispute resolution) or revoke one. Revocation does not refund USDC.
- **Treasury** (admin): withdraw accrued tier fees in USDC. The recipient
  defaults to the configured on-chain treasury; the current accrued balance
  and a **Max** shortcut are shown.

### Rewire protocol config (admin — high consequence)

`/admin` → **Protocol Config → Wiring & Tokens**.

1. Read the **Live Wiring** card first — it shows every wired address
   (membership manager, sanctions guards, oracle adapters, Polymarket
   adapter, treasury, payment token, voucher, Chainalysis oracle) so you can
   verify state before and after a change.
2. Use **Rewire Address** for single-address slots. For guard slots,
   `address(0)` **disables screening** and the form warns accordingly —
   follow compliance sign-off before doing this.
3. **Oracle Adapter Routing** maps a resolution type (Chainlink Data Feed /
   Chainlink Functions / UMA) to its adapter.
4. **Stake Token Allowlist**: check a token's current status, then allow or
   disallow. Disallowing blocks new wagers only; existing escrow settles.
5. The intents facet pointer is displayed read-only — swapping it is
   `UPGRADER_ROLE` via the [upgrade runbook](contract-upgrades.md), never
   from this screen.

### Run maintenance sweeps (any operator)

`/admin` → **Protocol Config → Maintenance**. Both calls are permissionless
on-chain; the view exists so operators can act without CLI tooling.

- **Expire Open Wagers** — enter wager IDs; expired Open wagers past their
  accept deadline are refunded to creators and their concurrent slots freed.
  Stale IDs are skipped harmlessly.
- **Trigger Auto-Resolution** — nudge an oracle-resolvable wager (Polymarket
  or a configured adapter) to settlement. The oracle outcome, not the
  caller, decides the winner.

### Monitor and fund the gasless infrastructure

`/admin` → **Infrastructure → Services** (admin or guardian).

- The **Gasless Infrastructure** card reads the relay-gateway `GET /status`:
  gateway reachability, killswitch state, per-chain RPC, and — for
  origin-authenticated callers — gas-wallet and paymaster-deposit runway
  hours. It is read-only; the gateway has no web admin API by design.
- The **Sponsored-Gas Paymaster** card (spec 050) shows the EntryPoint
  deposit (the sponsorship loss cap), verifying signer, and owner. Anyone can
  **top up** the deposit; **withdraw** and **rotate signer** are owner-only
  and part of incident response
  ([paymaster-operations](paymaster-operations.md)).
- Controls that stay runbook-operated (killswitch, quotas, builder fee,
  relayer per-chain pause) are listed on the same screen with their runbook
  pointers.

### Grant or revoke an operator role (admin)

1. `/admin` → **Access Control → Admin Roles**.
2. Pick the role — Guardian, Account Moderator, Role Manager, Compliance
   Officer (`SANCTIONS_ADMIN_ROLE`, lives on SanctionsGuard), Token Issuer
   (TokenFactory), or Default Admin (rare). The panel routes the grant to the
   contract that defines the role.
3. Enter the address or ENS name → **Grant Role** → sign. Follow the
   least-privilege guidance in [operator onboarding](operator-onboarding.md).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| "Access Restricted" on `/admin` | Connected wallet holds no operator role on this chain. Roles are chain-scoped — check the network selector first. |
| A group/view is missing from the rail | You lack the gating role; the rail only shows what you can use. |
| A view shows "not deployed on this network" | Address not in the frontend address book for this chain — run `npm run sync:frontend-contracts` after deploy. |
| Gasless card shows "No relay gateway configured" | `VITE_RELAYER_URL` unset in this build; gasless flows self-submit. Expected in local dev. |
| Runway numbers missing from the health card | The gateway only discloses operator telemetry to origin-authenticated callers; the public subset (RPC up/down) still renders. |
| A write reverts with an AccessControl error | The role lives on a different contract than you expect (e.g. `SANCTIONS_ADMIN_ROLE` is on SanctionsGuard, not the registry) or you hold it on another chain. |
