# Contract: sPOL liquid staking (spec 065, chainId 1)

External protocol — Polygon Labs' official native liquid staking token for POL. Live since 2026-04-14,
audited (ChainSecurity, Certora), open-source (`0xPolygon/spol-contracts`). Called from the member's
own wallet (non-custodial). Minimal inline ABI in `frontend/src/abis/SPOLController.js`. Addresses come
from the `staking.liquid[kind=spol].contracts` config block; verify against the source repo at build
time. Canonical mint/unstake is on **Ethereum L1** — the member needs POL on Ethereum (a
Polygon-PoS-native path via `sPOLChild` on 137 is a documented follow-up, not launch scope).

- sPOL token (L1): `0x3B790d651e950497c7723D47B24E6f61534f7969` (ERC-20, EIP-2612 permit).
- `sPOLController` (L1): `0xEaadA411F2600570796c341552b9869DA708a28B`.

## Stake (POL → sPOL)

- `POL.approve(controller, amount)` then `buySPOL(uint256 _amount)` (or `buySPOLPermit(...)` to skip the
  approve). Member holds **sPOL**, an **exchange-rate** token (value-accruing, NOT rebasing) — starts
  1:1 and rises as rewards accrue. Validation before prompt: amount > 0, ≤ POL balance, ≥ provider min;
  a native gas reserve applies to the ETH used for gas, not the POL principal. Summary discloses the
  sPOL received and that its value grows vs POL.
- (Future convenience: `buySPOLWithDPOL(_amount, _validatorOfDPOL)` migrates an existing ValidatorShare
  delegated position directly into sPOL — not launch scope.)

## Read position / rate / TVL

- Held sPOL: `sPOL.balanceOf(account)`; underlying POL value via `convertSPOLtoPOL(shares)`.
- APR: derived from `convertSPOLtoPOL` exchange-rate drift over time (no dedicated API); show as an
  estimate with "as of" freshness. TVL ("total staked"): `totalsPOLBalance()` × POL price.
- No separate reward claim — rewards accrue into the sPOL exchange rate (no Claim action for sPOL).

## Exit (sellSPOL → unbonding → withdrawPOL, or instant DEX swap)

1. `sellSPOL(uint256 _amount) → uint256[] nonces` (burns sPOL, opens unbonding). Persist each nonce as
   an `UnstakeRequest{ handle:{ unbondNonce } }`. Confirm UI shows the unbonding wait and requires
   acknowledgement (FR-006), **and** honestly presents the instant-exit alternative (below).
2. Detect claimable: `getUserOpenNonces(address _user) → FullNonceDetails[]` — poll to find matured
   nonces. Unbonding is the Polygon PoS withdrawal delay (~80–82 checkpoints ≈ 3–4 days).
3. Withdraw: `withdrawPOL()` (or `withdrawPOL(address _user)`) after maturity → returns POL; prune the
   request.
4. **Instant exit**: sPOL is a liquid ERC-20 with Uniswap V4 pools live at launch — the member may swap
   sPOL→POL at market rate immediately instead of waiting. The confirm UI presents both paths honestly
   (queue vs. market swap with its price impact); it never implies the `withdrawPOL` path is instant.

## Fees & attribution

- **Protocol fee**: `sPOLController.rewardFee` (per-mille, charged on **rewards** not principal,
  `MAX_FEE = 1000`) paid to `feeReceiver` — this is **Polygon's** fee, not FairWins'. Read the live
  value on-chain and disclose it as the provider's fee. FairWins charges **no** platform fee here
  (research.md R6).
- **No referral/attribution parameter** exists in any deposit signature — an integrator cannot attach a
  code or earn a protocol-level share. Do not fabricate a fee line.

## Honest-state obligations

- API/RPC failure ⇒ the sPOL option shows `unavailable`, staking disabled — never a fake zero/APR.
- The `withdrawPOL` exit wait is real (~3–4 days); surfaced before confirmation; the position is never
  shown "ready" until a nonce matures in `getUserOpenNonces`. The instant DEX swap is offered as the
  honest fast path, with its market price impact disclosed.
- sPOL is exchange-rate: display as `balanceOf × convertSPOLtoPOL`; never expect balance rebasing.
