# Resolving and Challenging a Wager

This guide covers the end-of-life of a P2P wager: proposing an outcome, the challenge period, arbitration, and claiming winnings.

## Wager Resolution Flow

```
Trading Period Ends
        |
        v
  Pending Resolution
        |
        v
  Party Proposes Outcome
        |
        v
  Challenge Period (default: 24 hours)
       / \
      /   \
  No Challenge    Challenge Filed
      |               |
      v               v
  Resolution      Arbitrator
  Finalized       Resolves
      |               |
      v               v
  Winner Claims   Winner Claims
  Winnings        Winnings
```

## Step 1: Trading Period Ends

When the wager's end date passes, the status transitions from **Active** to **Pending Resolution**. No more acceptance or participation changes can occur.

The wager dashboard shows the status change and indicates that resolution is now available.

## Step 2: Propose a Resolution

Who can propose depends on the resolution type set at creation:

| Resolution Type | Who Can Propose |
|----------------|-----------------|
| Either Party | Creator or opponent |
| Creator Only | Only the wager creator |
| Opponent Only | Only the opponent |
| Third Party | The designated arbitrator |
| Auto-Pegged | Resolved automatically from oracle source |

To propose an outcome:

1. Open the wager from your dashboard
2. Click **Propose Resolution**
3. Select the outcome: **True** (creator wins) or **False** (opponent wins)
4. Confirm the transaction

The contract records the proposal and starts the challenge period.

### Auto-Pegged Resolution

For wagers pegged to an external oracle (Polymarket, Chainlink, UMA), resolution happens differently:

- **Polymarket** -- The system reads the outcome from the pegged Polymarket event
- **Chainlink** -- Price feed data determines the outcome
- **UMA** -- A truth assertion resolves the wager

Call the appropriate function (`resolveFromOracle` or `resolveFromPolymarket`) or wait for the system to trigger it automatically.

## Step 3: Challenge Period

After a resolution is proposed, a **challenge period** begins. The default duration is 24 hours but may be configured differently per wager.

During this period, the other party can review the proposed outcome and decide whether to accept or challenge it.

### If No Challenge

If the challenge period expires without a challenge:

1. Anyone can call **Finalize Resolution** to lock in the outcome
2. The wager status transitions to **Resolved**
3. The winner can now claim their winnings

### If Challenged

If the other party disagrees with the proposed outcome:

1. Click **Challenge Resolution** on the wager details page
2. Post a challenge bond (the required amount is displayed in the UI)
3. Confirm the transaction

The wager status transitions to **Challenged**, and the designated arbitrator is notified.

**Challenge bond behavior:**
- If the challenge **succeeds** (arbitrator overturns the proposal), the bond is returned to the challenger
- If the challenge **fails** (arbitrator upholds the proposal), the bond is forfeited

## Step 4: Arbitrator Resolution (Challenged Wagers Only)

When a wager is challenged, the designated arbitrator resolves the dispute:

1. The arbitrator reviews the wager terms and the proposed/challenged outcome
2. The arbitrator calls `resolveDispute(friendMarketId, outcome)` with the correct outcome
3. The wager transitions to **Resolved**

If no arbitrator was designated at creation, the platform's default dispute resolution process applies.

## Step 5: Claim Winnings

Once the wager is resolved:

1. Open the resolved wager from your dashboard
2. If you are the winner, click **Claim Winnings**
3. Confirm the transaction
4. Your winnings (your stake + opponent's stake, minus any fees) are transferred to your wallet

For group wagers, each winner claims individually based on their share.

### Claim Timeout

Winners have **90 days** to claim their winnings after resolution. After the claim timeout:

- Unclaimed funds are swept to the platform treasury
- The winner can no longer claim
- This prevents funds from being locked indefinitely in the contract

Check your dashboard regularly for resolved wagers that need claiming.

## Step 6: Oracle Timeout and Mutual Refund

If a wager uses oracle-based resolution and the oracle fails to report within **30 days** of the expected resolution time:

1. The wager status transitions to **Oracle Timed Out**
2. A mutual refund is triggered automatically
3. All participants receive their original stakes back
4. No winner is declared

Either party can also request a **mutual refund** at any time if both agree:

1. One party clicks **Request Mutual Refund**
2. The other party clicks **Accept Mutual Refund**
3. Once both have agreed, all stakes are returned

## Timeline Summary

| Event | Timeframe |
|-------|-----------|
| Acceptance deadline | Default 48 hours from creation |
| Trading period | Default 7 days from activation |
| Challenge period | Default 24 hours after resolution proposal |
| Claim timeout | 90 days after resolution |
| Oracle timeout | 30 days after expected resolution time |

## Troubleshooting

**"NotPendingResolution" error** -- The trading period has not ended yet. Wait for the wager end date to pass.

**"NotAuthorized" error** -- You are not authorized to propose a resolution for this wager. Check the resolution type to see who is allowed.

**"ChallengePeriodNotExpired" error** -- The challenge period is still active. Wait for it to expire before finalizing.

**"AlreadyChallenged" error** -- This resolution has already been challenged. Wait for the arbitrator to resolve.

**"AlreadyClaimed" error** -- Winnings have already been claimed for this wager.

**"ClaimTimeoutNotExpired" error** -- The 90-day claim window has not expired yet (relevant for treasury sweep).

**Cannot find the Claim button** -- Only the winner sees the claim option. If the outcome was not in your favor, there is nothing to claim.

## Related Guides

- [Creating a Wager](create-wager.md)
- [Accepting a Wager](accept-wager.md)
