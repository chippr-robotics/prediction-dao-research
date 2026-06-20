# Roles and Tiers

The protocol has **one user-purchasable role** and **five on-chain admin
roles**. Every privileged action is gated by exactly one of the admin roles,
enforced via OpenZeppelin AccessControl.

## The user-purchasable role

### `WAGER_PARTICIPANT_ROLE`

The one paid role. Required to call `WagerRegistry.createWager`. Sold by
`MembershipManager` in USDC.

Four tiers, all valid for **30 days**, anchored at $2 Bronze:

| Tier | Price (USDC) | Wagers / month | Open wagers at once |
|------|--------------|----------------|---------------------|
| Bronze   | $2   | 15        | 5         |
| Silver   | $8   | 30        | 10        |
| Gold     | $25  | 100       | 30        |
| Platinum | $100 | Unlimited | Unlimited |

The two limits (`monthlyMarketCreation`, `maxConcurrentMarkets`) are the
**only** on-chain restrictions. Stake size, resolution type (Either /
Creator / Opponent / ThirdParty / Polymarket), and token choice (USDC or
WMATIC) are not gated by tier — Bronze gets the same feature set as Platinum,
just lower throughput.

Membership rolls in a 30-day window: the monthly counter resets the first
time you create a wager after 30 days have elapsed since the last reset.
Closed wagers (resolved, refunded, or cancelled) free up your concurrent
slot.

## The five admin roles

All admin roles are bytes32 hashes enforced via OpenZeppelin AccessControl on
either `MembershipManager` or `WagerRegistry`.

| Constant | Contract | What it can do | Typical holder |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | both | Configure tiers, set treasury / payment token, authorise registry hooks, withdraw fees, and grant / revoke **all other admin roles** | Multisig |
| `GUARDIAN_ROLE` | WagerRegistry | `pause` and `unpause` WagerRegistry in response to security incidents | Multisig + on-call signer(s) |
| `ACCOUNT_MODERATOR_ROLE` | WagerRegistry | `freezeAccount` / `unfreezeAccount` for individual accounts | Trust-and-safety multisig |
| `ROLE_MANAGER_ROLE` | MembershipManager | `grantMembership` / `revokeMembership` outside the purchase flow (gifts, support, dispute resolution) | Ops multisig |
| `UPGRADER_ROLE` | WagerRegistry | Replace the contract implementation behind the UUPS proxy (logic swaps, stable address). Separate from `DEFAULT_ADMIN_ROLE` for least privilege | Floppy-keystore admin |

The separation is deliberate: a guardian can stop the protocol but cannot
seize an account; an account moderator can freeze an account but cannot pause
the protocol or move treasury funds; a role manager can hand out memberships
but cannot revoke admin roles; an upgrader can ship new logic behind the proxy
but holds no other privilege and cannot grant itself one.

## What each role can **not** do

| Role | Cannot |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Cannot create wagers on behalf of users; cannot resolve wagers; cannot move escrowed stakes |
| `GUARDIAN_ROLE` | Cannot freeze individual accounts; cannot configure tiers; cannot withdraw fees |
| `ACCOUNT_MODERATOR_ROLE` | Cannot pause the protocol; cannot configure tiers; cannot withdraw fees; cannot seize funds |
| `ROLE_MANAGER_ROLE` | Cannot grant or revoke admin roles; cannot pause; cannot freeze; cannot withdraw fees |
| `UPGRADER_ROLE` | Cannot grant or revoke admin roles; cannot pause; cannot freeze; cannot configure tiers; cannot withdraw fees; cannot move escrowed stakes |

## Related documents

- [Account moderation policy](account-moderation.md) — the canonical reference
  for the freeze power, including grounds, audit trail, and unfreeze path.
- [Security](security.md) — pause/unpause flow, threat model, and the custom
  errors a user might see in MetaMask.
- [How it works](how-it-works.md) — the wager lifecycle end-to-end.
