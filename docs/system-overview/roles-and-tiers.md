# Roles and Tiers

The protocol has **one user-purchasable role** and **six core operator
roles**, plus a handful of registry-scoped roles. Every privileged action is
gated by exactly one role, enforced via OpenZeppelin AccessControl.

Operators exercise these roles from the **operations control plane** at
`/admin` — a grouped console (Control Room, Incident Response, Compliance,
Membership & Revenue, Protocol Config, Identity, Access Control,
Infrastructure) where each view appears only if the connected wallet holds
the role it requires. The full inventory of what is controllable from where
lives in [the control-surface audit](control-surface-audit.md).

## The user-purchasable role

### `WAGER_PARTICIPANT_ROLE`

The one paid role. Required to create or accept wagers. Sold by
`MembershipManager` in USDC. The default state is the **None** tier — no
membership, no participation.

Four paid tiers, all valid for **30 days**, anchored at $2 Bronze:

| Tier | Price (USDC) | Wagers / month | Open wagers at once |
|------|--------------|----------------|---------------------|
| None     | —    | 0         | 0         |
| Bronze   | $2   | 15        | 5         |
| Silver   | $8   | 30        | 10        |
| Gold     | $25  | 100       | 30        |
| Platinum | $100 | Unlimited | Unlimited |

The two limits (`monthlyMarketCreation`, `maxConcurrentMarkets`) are the
**only** throughput restrictions. Stake size, resolution type (Either /
Creator / Opponent / ThirdParty / Polymarket / Chainlink / UMA), and token
choice (USDC or WMATIC) are not gated by tier — Bronze gets the same feature
set as Platinum, just lower throughput. One exception: creating an **open
challenge** (`createOpenWager`, a code-gated wager with no named opponent)
requires **Silver or above**, though *taking* one needs only any active tier.

### Two ways to get a membership

- **Buy a tier directly** — `purchaseTier` / `purchaseTierWithTerms` in USDC.
  The resulting membership is **soulbound** (non-transferable) and time-bound.
- **Redeem a voucher** — a `MembershipVoucher` is a transferable ERC-721 bought
  with USDC at a tier's price (see spec 026). It confers no membership while
  held, so it can be **gifted or resold**; redeeming it (`redeemVoucher`) burns
  the voucher and writes the soulbound membership to the redeemer. The voucher
  contract is immutable; redemption screens the redeemer through `SanctionsGuard`.

Membership rolls in a 30-day window: the monthly counter resets the first
time you create a wager after 30 days have elapsed since the last reset.
Closed wagers (resolved, refunded, or cancelled) free up your concurrent
slot.

## The six core operator roles

All operator roles are bytes32 hashes enforced via OpenZeppelin AccessControl
on the contract that defines them (`MembershipManager`, `WagerRegistry`, or
`SanctionsGuard`). Grants and revocations are performed from the control
plane's **Access Control → Admin Roles** view, which routes each grant to the
contract that owns the role.

| Constant | Contract | What it can do | Typical holder |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | MembershipManager + WagerRegistry | Configure tiers, set treasury / payment token, rewire protocol config (oracle adapters, sanctions guards, stake-token allowlist), withdraw fees, and grant / revoke **all other operator roles** | Multisig |
| `GUARDIAN_ROLE` | WagerRegistry | `pause` and `unpause` WagerRegistry in response to security incidents | Multisig + on-call signer(s) |
| `ACCOUNT_MODERATOR_ROLE` | WagerRegistry | `freezeAccount` / `unfreezeAccount` for individual accounts | Trust-and-safety multisig |
| `ROLE_MANAGER_ROLE` | MembershipManager | `grantMembership` / `revokeMembership` outside the purchase flow (gifts, support, dispute resolution) | Ops multisig |
| `SANCTIONS_ADMIN_ROLE` | SanctionsGuard | Maintain the discretionary deny-list (`setDenied`, with an on-chain reason). Surfaced in the frontend as **Compliance Officer** and gates the control plane's Compliance group | Compliance multisig |
| `UPGRADER_ROLE` | all UUPS proxies | Replace the contract implementation behind a UUPS proxy (logic swaps, stable address). Separate from `DEFAULT_ADMIN_ROLE` for least privilege | Floppy-keystore admin |

The separation is deliberate: a guardian can stop the protocol but cannot
seize an account; an account moderator can freeze an account but cannot pause
the protocol or move treasury funds; a role manager can hand out memberships
but cannot revoke admin roles; a compliance officer can block an address from
the protocol but holds no other privilege; an upgrader can ship new logic
behind the proxy but holds no other privilege and cannot grant itself one.

### Registry-scoped roles

Beyond the core six, individual registries define narrow roles for their own
surface, also grantable from the control plane:

- `TOKEN_ISSUER_ROLE` (TokenFactory) — gate on the token `create*` entrypoints.
- `REGISTRY_CURATOR_ROLE` / `MODERATOR_ROLE` / `VERIFIER_ROLE`
  (CallsignRegistry) — reserve, suspend, and verify `%callsigns`; see the
  [callsigns runbook](../runbooks/callsigns-operations.md).

## What each role can **not** do

| Role | Cannot |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Cannot create wagers on behalf of users; cannot resolve wagers; cannot move escrowed stakes |
| `GUARDIAN_ROLE` | Cannot freeze individual accounts; cannot configure tiers; cannot withdraw fees |
| `ACCOUNT_MODERATOR_ROLE` | Cannot pause the protocol; cannot configure tiers; cannot withdraw fees; cannot seize funds |
| `ROLE_MANAGER_ROLE` | Cannot grant or revoke admin roles; cannot pause; cannot freeze; cannot withdraw fees |
| `SANCTIONS_ADMIN_ROLE` | Cannot pause; cannot freeze accounts on the registry; cannot configure tiers; cannot withdraw fees; cannot disable oracle screening (that is `DEFAULT_ADMIN_ROLE` on SanctionsGuard) |
| `UPGRADER_ROLE` | Cannot grant or revoke admin roles; cannot pause; cannot freeze; cannot configure tiers; cannot withdraw fees; cannot move escrowed stakes |

## Related documents

- [Control-surface audit](control-surface-audit.md) — the inventory of every
  administrative control (on-chain, service-level, frontend) and the
  operations control plane's structure.
- [Account moderation policy](account-moderation.md) — the canonical reference
  for the freeze power, including grounds, audit trail, and unfreeze path.
- [Security](security.md) — pause/unpause flow, threat model, and the custom
  errors a user might see in MetaMask.
- [How it works](how-it-works.md) — the wager lifecycle end-to-end.
