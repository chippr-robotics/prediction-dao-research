# Contract: Merkl rewards read + claim (`frontend/src/lib/earn/merkl.js`)

Morpho distributes all current rewards via Merkl (MIP-111). The deprecated
`rewards.morpho.org` / Universal Rewards Distributor flow is intentionally NOT implemented;
legacy balances link out to `https://rewards-legacy.morpho.org/`.

## Read

```
GET https://api.merkl.xyz/v4/users/{addressLowercase}/rewards?chainId={chainId}
```

- Address MUST be lowercased (API requirement).
- Response: array of `{ chain: { id }, rewards: [{ token, amount, claimed, pending, proofs }] }`.
- Amounts are cumulative lifetime strings → `bigint`. `claimable = amount − claimed`.
- Entries with empty `proofs` or `claimable === 0n && pending === 0n` are filtered out of the
  claim surface (pending-only entries render informatively, without a claim button).
- Data updates ~every 8 hours ⇒ UI carries freshness copy ("Reward figures update every few
  hours"); a fetch failure maps to status `unavailable` (explicit state, never zero).

## Claim (on-chain)

Contract: Merkl Distributor `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae` (identical on Ethereum
mainnet + Polygon; sourced from `networks.js` earn config, never from the API response).

```solidity
function claim(
  address[] calldata users,    // all = connected account
  address[] calldata tokens,   // reward token per entry
  uint256[] calldata amounts,  // CUMULATIVE amount per entry (NOT the difference)
  bytes32[][] calldata proofs  // per-entry Merkle proofs from the API
) external;
```

Builder rule (`buildClaimArgs(account, rewards)`): include every reward with `claimable > 0n` and
non-empty proofs; four parallel arrays index-aligned. The distributor transfers only the
unclaimed difference; repeating a claim with the same cumulative amount is a safe no-op — the UI
still prevents pointless prompts by disabling Claim when `claimable === 0n`.

## Post-claim

- Refresh on-chain reward-token balances immediately; re-fetch Merkl data and reconcile
  (API `claimed` may lag the chain — display "claim submitted/confirmed" from the tx receipt, not
  from the API).
- Emit `earn-rewards-claimed` activity entry with the tx explorer link (spec 031 shape).
