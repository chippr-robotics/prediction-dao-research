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

## Reading the estate: what "per network" means here (spec 071)

The console reads **every network this build may touch**, not the one your wallet happens to be
connected to. Two consequences you will notice immediately:

- **You can get in from anywhere.** Entry asks every network whether you hold an operator role,
  so a guardian on Polygon reaches the console from a wallet pointed at Base. The permissions
  card names the network each role was found on — a bare ✓ on a per-chain role is not enough to
  act on.
- **Your membership is read on one network.** Membership lives on Polygon (Amoy on testnet
  builds) and nowhere else, so it resolves there whatever your wallet says.

### The three states, and why a zero is never one of them

Every per-network figure is in exactly one of three states, and they are deliberately not
interchangeable:

| State | Means | Do |
|---|---|---|
| a value | the contract answered | act on it |
| *Not deployed on this network* | there is no such contract here | nothing to do here |
| *Could not be read — <reason>* | **we could not ask** | retry; do not read it as zero |

The third is the one that matters. A silent `0` on a control surface reads as a fact, so an
unreachable network always says so and is excluded from any total — and that total is then
labelled **partial** and names what is missing.

For the same reason, balances are **never summed across networks**: different chains hold
different payment tokens, so totals are shown per token. And **accrued** fees (undrawn, still
withdrawable) are never added to **treasury** balances (already delivered) — they are different
kinds of money.

### Reads span the estate; writes do not

Every change is one transaction on **one named network**, and the button says which. If your
wallet is on a different network the control is withheld *and tells you which network to switch
to* — before you sign, not at signature time.

There is deliberately **no control that acts on several networks at once**. No "pause
everywhere", no bulk freeze. A killswitch that fans out is one an operator can fire without
knowing what they hit, so each network is paused, frozen, or withdrawn from explicitly.

If a control is offered but says **authority could not be confirmed**, that is honest: we could
not reach that network's contract to check your role. The contract itself will still refuse
anything you do not hold — the control stays available because hiding a killswitch on a failed
read tells an operator who *does* hold it that there isn't one.

## Navigating: the collapsible section rail

The groups above render as a side panel down the left of `/admin`, with the
hamburger (☰) pinned to its **top left**. The panel has two widths and the
hamburger switches between them:

- **Expanded** — group headings plus the full label of every view.
- **Collapsed** — an icon-only rail. Every view you can use is still listed and
  still one click away; only the text is hidden (hover for the name). Collapsing
  never removes a section from reach, so you can work from a wide content column
  and still jump straight to Emergency.

It opens expanded on desktop and collapsed on mobile, where expanding slides the
panel over the content — pick a view, tap the dimmed area, or press `Esc` to
close it again. Mobile also keeps the bottom icon bar for switching between
views without opening the panel at all.

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
| The rail is a strip of icons with no labels | It is collapsed, not broken — every view is still there. Hover for a name, or click the hamburger at its top left to expand. |
| A view shows "not deployed on this network" | Address not in the frontend address book for this chain — run `npm run sync:frontend-contracts` after deploy. |
| Gasless card shows "No relay gateway configured" | `VITE_RELAYER_URL` unset in this build; gasless flows self-submit. Expected in local dev. |
| Runway numbers missing from the health card | The gateway only discloses operator telemetry to origin-authenticated callers; the public subset (RPC up/down) still renders. |
| A write reverts with an AccessControl error | The role lives on a different contract than you expect (e.g. `SANCTIONS_ADMIN_ROLE` is on SanctionsGuard, not the registry) or you hold it on another chain. |
