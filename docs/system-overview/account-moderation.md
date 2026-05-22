# Account Moderation Policy

> **Effective**: from the v3 P2P refactor onward.
> **Authority**: holders of `ACCOUNT_MODERATOR_ROLE` on the `WagerRegistry` contract.

This page describes how account moderation works on the protocol, what powers
the operators have, and what those powers do and do not affect for you as a
user.

## Why moderation exists

The protocol is permissionless at the smart-contract level, but the operator
team retains a narrow set of on-chain powers to deal with abuse, fraud signals,
court orders, and security incidents. Each power is bound to a specific
on-chain role so that no single key holds blanket authority — see the
[roles overview](roles-and-tiers.md) for the full separation-of-powers table.

This page focuses on **account moderation**, which is the per-account
freeze/unfreeze power. For protocol-wide pausing, see
[Operator powers in security.md](security.md#operator-powers).

## What an account freeze does

When an `ACCOUNT_MODERATOR_ROLE` holder calls
`WagerRegistry.freezeAccount(user, reason)`, the affected account is blocked
from the following actions on `WagerRegistry` until an
`ACCOUNT_MODERATOR_ROLE` holder calls `unfreezeAccount(user)`:

| Function           | Blocked while frozen?                                  |
|--------------------|--------------------------------------------------------|
| `createWager`      | Yes — the transaction reverts with `AccountFrozenError` |
| `acceptWager`      | Yes                                                    |
| `cancelOpen`       | Yes                                                    |
| `declareWinner`    | Yes (when the caller is frozen)                        |
| `claimPayout`      | Yes                                                    |
| `claimRefund`      | Yes (when the caller is frozen)                        |

## What an account freeze does **not** do

- It does **not** affect funds in your own wallet outside `WagerRegistry`.
  Your USDC, WMATIC, native tokens, NFTs, and any other contract interactions
  are unaffected.
- It does **not** expire your `WAGER_PARTICIPANT` membership early. The tier
  and expiry date you purchased remain intact; when you are unfrozen you
  resume from the same expiry.
- It does **not** seize any escrowed stake. Stakes in open or active wagers
  stay in the contract until they are released by ordinary settlement.
- It does **not** stop a wager you are part of from settling.
  `autoResolveFromPolymarket` is permissionless: anyone can trigger Polymarket
  resolution for an active wager. The winner — even if frozen — is recorded
  on-chain; they simply cannot **claim** the payout until they are unfrozen.
- It does **not** affect other users. A freeze is per-account, not
  protocol-wide.

## The on-chain audit trail

Every freeze and unfreeze emits a public event on `WagerRegistry`:

```solidity
event AccountFrozen(address indexed user, address indexed by, string reason);
event AccountUnfrozen(address indexed user, address indexed by);
```

These events are queryable on the block explorer. The `by` field records the
moderator address that triggered the action; the `reason` field on
`AccountFrozen` is free-text and is intended to document the cause (e.g.
"fraud investigation #N", "court order docket #X", "TOS violation").

You can query an account's current state at any time:

```solidity
function isFrozen(address user) external view returns (bool);
```

The in-product role details card also surfaces a banner when your connected
account is frozen, including the reason from the most recent
`AccountFrozen` event.

## Grounds for a freeze

Account moderation is reserved for clear, documentable cause. Illustrative
(non-exhaustive) examples:

- A confirmed pattern of fraud — fake settlement, coordinated wash trading,
  social-engineered counterparty selection.
- Reports of stolen funds, where the source of stake has been traced to a
  known compromise.
- A lawful order (subpoena, court order, regulator request) requiring
  intervention.
- Active investigation of a security incident affecting the protocol.

A freeze is not a substitute for litigation, dispute resolution between
counterparties, or normal customer support. If you have a counterparty dispute
on a wager (e.g. you believe a `ThirdParty` arbitrator declared the wrong
winner), the path is the resolution mechanics of the wager itself, not a
moderation request.

## Unfreeze path

If your account has been frozen and you believe it should not have been, the
on-chain audit trail (the `AccountFrozen` event for your address) is the
starting point. Contact the address recorded in the event's `by` field, or
reach out to the operator team through the channels listed on the project
homepage. Provide:

1. Your wallet address.
2. The block / transaction hash of the freeze event.
3. The reason you believe the freeze is in error or has been resolved.

`ACCOUNT_MODERATOR_ROLE` holders can call `unfreezeAccount(user)` to restore
access. The unfreeze is also recorded on-chain via the `AccountUnfrozen`
event.

## Freeze vs. pause

Pause and freeze are two distinct operator powers that often get conflated.

| Question | Pause | Freeze |
|---|---|---|
| Who is affected? | All users protocol-wide | One specific account |
| Which role authorises it? | `GUARDIAN_ROLE` | `ACCOUNT_MODERATOR_ROLE` |
| Intended for? | Security incidents, exploit mitigation | Per-account abuse or legal cause |
| Reversal authority | `GUARDIAN_ROLE` (`unpause`) | `ACCOUNT_MODERATOR_ROLE` (`unfreezeAccount`) |

Pausing is described in [security.md](security.md#operator-powers).

## Governance authority

`ACCOUNT_MODERATOR_ROLE` is itself controlled by `DEFAULT_ADMIN_ROLE` (held by
the protocol's deployer/multisig). The default admin can grant moderator
authority to additional addresses (e.g. a trust-and-safety multisig) or revoke
it at any time via OpenZeppelin AccessControl's standard `grantRole` /
`revokeRole`. See [Roles and Tiers](roles-and-tiers.md).
