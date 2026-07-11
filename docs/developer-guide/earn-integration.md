# Earn Integration (Morpho Lending & Merkl Rewards)

Spec 050 (`specs/050-earn-lending-rewards/`) adds the Finance → Earn section: lending into
curated Morpho ERC-4626 vaults with Merkl reward claiming. This page documents the architecture,
configuration contract, and the platform-fee decision. It is frontend-only — no FairWins
contracts, no backend.

## Architecture

```text
config/earn.js                 global endpoints + limits + earnPath() deep links
config/networks.js             per-network `earn` block + capability + helpers
lib/earn/morphoApi.js          Morpho GraphQL: vault discovery + position enrichment
lib/earn/merkl.js              Merkl REST: reward balances + claim-arg builder
lib/earn/vaultActions.js       ethers v6 ERC-4626 reads/validators/deposit/withdraw
lib/earn/earnActivityBuffer.js queues user actions for the activity source
hooks/useEarnVaults|Positions|Rewards.js
components/earn/*              EarnPanel (hub) / EarnLendView / VaultSheet /
                               EarnRewardsView / EarnPositionsList
data/notifications/sources/earnSource.js   spec-031 activity source
```

Data flow is honest-state throughout (constitution III): vault lists and APY come live from
Morpho's API (explicit `unavailable` on failure — deposits disabled, never stale numbers);
positions are authoritative on-chain reads (`balanceOf` + `convertToAssets` + `maxWithdraw`)
with API USD/pnl enrichment that degrades to "—"; reward figures carry Merkl's ~8-hour cadence
in the UI copy and a fetch failure is an explicit state, never a zero.

## External coordinates

| What | Where |
|---|---|
| Morpho GraphQL API | `https://api.morpho.org/graphql` (public, 750 req/min) |
| Merkl rewards API | `https://api.merkl.xyz/v4/users/{lowercased}/rewards?chainId=` |
| Merkl Distributor | `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae` (same on all chains) |
| Legacy rewards (pre-MIP-111) | `https://rewards-legacy.morpho.org/` (link-out only) |

The deprecated `rewards.morpho.org` / Universal Rewards Distributor flow is intentionally not
implemented — Morpho migrated all reward distribution to Merkl (MIP-111). Claims pass the
**cumulative** earned amount + proofs; the distributor pays the unclaimed difference, so repeat
claims are safe no-ops.

## Vault curation

No hand-maintained vault lists. The client queries `vaults(where: { chainId_in, whitelisted:
true })`, requires `listed: true` (vaults shown on the Morpho app itself), keeps API TVL
ordering, and caps at `VAULT_LIST_LIMIT`. Only Morpho **Vault V1 (MetaMorpho)** is surfaced in
this cut: V1 implements the full ERC-4626 surface including honest `maxDeposit`/`maxWithdraw`
(Vault V2 returns 0 from `max*` by design, which breaks honest limit display).

## Enabling a new network

Everything is config-driven (`FR-008`). To enable earn on a chain (e.g. Base once it becomes a
FairWins network):

1. Confirm Morpho vaults **and** the Morpho API serve the chain, and Merkl covers it.
2. Add `earn: earnConfig()` to the chain's `NETWORKS` entry in
   `frontend/src/config/networks.js` (the capability getter picks it up automatically).
3. Done — nav, panel gating, portfolio action, and the activity source all key off
   `capabilities.earn` / `isEarnAvailable(chainId)`.

Networks without the block render an honest unavailable state naming `getEarnNetworks()`.
Testnets stay disabled: the Morpho API has no testnet data, and a mock vault list would violate
constitution III.

## Deposit/withdraw safety rails

- Pure validators (`validateDepositAmount`/`validateWithdrawAmount`) reject zero/junk/over-limit
  amounts with member-facing reasons **before** any wallet prompt.
- Writes are `{ target, data, value }` batches submitted through
  **`WalletContext.sendCalls`** (spec 041's unified rail) — never a raw ethers signer. Passkey
  sessions (which have no signer) authorize the whole approve+deposit batch with ONE WebAuthn
  ceremony via UserOp; classic wallets sign sequentially. Reads (allowance, dry-runs) use the
  chain's read provider.
- Deposits: exact-amount `approve` leg when the allowance is short (no unlimited allowances);
  spendable deposits are dry-run with `staticCall` from the member's address before signing.
- Withdrawals: bounded by `maxWithdraw` (vault liquidity, surfaced in the UI); full exits use
  `redeem(shares)` so share dust never strands.

## Activity feed (FR-010)

`earnSource` follows the spec-031 ActivitySource contract. User actions queue
`{type, refId, message, txHash, txUrl}` records via `earnActivityBuffer`; the source drains them
into precise entries (entries carry `txUrl`, which the feed renders as a "View transaction"
explorer link) and snapshot-diffs tracked vault share balances as a backstop for changes made
outside the app. First sight is baseline; a hard read failure returns `ok:false` so the engine
keeps the prior slice.

## Platform attribution & treasury fee (the issue #861 conditional)

Morpho has **no transaction-source referral or fee parameter** — nothing like Aave's referral
code exists in the ERC-4626 path, Bundler3, or the API. Resolution (research.md R4):

- The protocol-**mandated** UI attribution ("Powered by Morpho" + risk disclosure) is
  implemented in `EarnPanel`.
- **No platform fee is charged in this release** (FR-013), and the UI says so.
- The documented path to treasury revenue is a **fee-wrapper vault** (a Vault V2 owned by the
  FairWins treasury wrapping a curated vault with a performance/management fee — see Morpho's
  ["How can distributors generate revenue"](https://docs.morpho.org/build/earn/concepts/generate-revenue/)),
  or an offchain curator revenue-share agreement. The wrapper is a new value-bearing contract
  and therefore a future spec with the full security lifecycle (constitution I), not a rider on
  this frontend feature.

## Testing

`frontend/src/test/earn/` covers config gating, API normalizers, cumulative claim math,
validators, the activity source contract, panel/sheet/rewards component states (including
honest unavailable states and deep links), and axe WCAG audits. Run with:

```bash
npm run test:frontend -- earn
```
