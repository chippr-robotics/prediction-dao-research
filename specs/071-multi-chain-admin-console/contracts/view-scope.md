# Contract: What every converted operator view must honour

**Applies to**: all **17** views of the operations control plane — the tab ids in
`components/admin/adminNav.js`. Bridge and Supply already comply **with this scope contract** and are
the reference implementation, leaving **15** to convert.

Note the scope of that compliance: Bridge and Supply satisfy every clause below, but their reads
currently reach the chain through a hand-built provider that bypasses the member's endpoint
override (research R2). Task T010 fixes that while promoting the helper, so their read *behaviour*
does change even though their scope behaviour does not.

This is a behavioural contract, not an API. A view "is converted" when it satisfies every clause
below and has tests proving it.

## 1. Scope is a network the operator picks — not the wallet's

- The view offers a network scope covering the cohort chains where its contract can exist.
- Default scope: the wallet's chain when it is in the roster, otherwise the first roster entry.
- **The scope does not change when the wallet changes network** (FR-016). An operator mid-audit must
  not have their reading silently re-targeted. Only write-control availability reacts.
- Scope is per view. Scoping Fees to Base does not move Staking.

## 2. Every chain shows one of three states — and a zero is never one of them

Per FR-014, each chain renders as exactly one of:

| State | Renders as |
|---|---|
| read | the value |
| not deployed on this chain | an explicit "not deployed on <chain>" |
| could not be read | an explicit unreadable marker **with the reason**, plus a retry |

A view may not render `0`, an empty table, or nothing at all for the latter two. This is the single
most important clause: an operator auditing a control surface reads a silent zero as a fact.

## 3. Chains render as they arrive

No view blocks on the slowest endpoint (FR-015). A slow chain shows as pending; its siblings are
already readable.

## 4. Writes are single-chain, named, and doubly gated

- A write targets exactly one chain, and **the confirmation names it** (FR-017).
- The control is withheld unless the wallet is on the scoped chain, and the view **says so before
  the operator tries** — "switch to <chain> to act" — rather than failing at signature time
  (FR-018). Zero write attempts should fail for being on the wrong chain (SC-005).
- The control is withheld unless authority was verified **against the contract on the scoped chain**
  (FR-019). App-wide role flags decide whether the *view* appears; they never decide whether a
  *write* is offered.
- No control performs one action across several chains (FR-020). There is no "pause everywhere".

## 5. Unreadable authority does not withdraw a control

If the authority read fails, the control stays offered and authority is shown as unconfirmed. The
contract is the real gate and refuses what the operator does not hold. Hiding a killswitch because
an RPC timed out tells an operator who holds it that there isn't one — the failure mode spec 067
FR-044 already names.

`deployed: false` is different: there is genuinely no contract to act on, and the control is hidden
with that stated.

## 6. Aggregates are per unit and labelled when partial

Any view showing a figure across chains uses `aggregate` from the estate helper: per-unit subtotals,
never one cross-unit number (FR-022), and a `partial` label naming the missing chains whenever an
unreadable chain was excluded (FR-023).

## 7. Accessibility unchanged

Scope selectors and per-chain state carry accessible names and pass the axe checks already in CI
(constitution V). Per-chain status is conveyed by text, not colour alone.

---

## Per-view notes

| View | Contract on the scoped chain | Notes |
|---|---|---|
| Overview | MembershipManager, WagerRegistry | Fee reporting per research R6: accrued (undrawn) where a MembershipManager exists; treasury received-balance where a FeeRouter routes. Never summed together. |
| Emergency | WagerRegistry | Pause is per chain. **No cross-chain pause-all** (FR-020). Converted last (research R8). |
| Account Moderation | WagerRegistry | Freeze is per chain; the confirmation names it. Converted last. |
| Deny-list | SanctionsGuard | |
| Tiers | MembershipManager | Reference chain is the only cohort mainnet carrying one — the scope selector shows the rest as not deployed, which is the honest answer. |
| Members | MembershipManager | As above. |
| Treasury | MembershipManager | Withdrawal is per chain. |
| Fees | FeeRouter | Deployed on many chains; rates are per chain and genuinely differ. |
| Staking | StakingRouter | |
| Bridge / Supply | BridgeRouter / LiquidityRouter | **Already compliant** — reference implementation. |
| Wiring & Tokens | WagerRegistry, MembershipManager, SanctionsGuard | |
| Oracle Adapters | the three adapters | Polygon/Amoy only; elsewhere not deployed. |
| Maintenance | WagerRegistry (intents facet) | Permissionless calls; still one named chain per call. |
| Callsigns | CallsignRegistry | |
| Admin Roles | role-defining contracts | Grants are per contract **per chain** — already true on-chain; the view must stop implying otherwise. |
| Services | gateway + paymaster | Paymaster deposit is per chain. |
