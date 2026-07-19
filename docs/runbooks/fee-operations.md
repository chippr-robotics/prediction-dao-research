# Runbook: Platform Fee Operations

Spec 060. Operating the unified platform-fee system: the `FeeRouter` contract (per network),
the AdminPanel **Fees** tab, and the relay-gateway's on-chain rate read for Predict.

Roles: rate changes need `FEE_ADMIN_ROLE`; treasury changes and service registration need
`DEFAULT_ADMIN_ROLE` (floppy-keystore flow for cold admin keys). The Fees tab uses the connected
wallet — on-chain roles are the enforcement, the UI only pre-validates.

## View current fees

1. Operations control plane → **Fees** (visible with ADMIN or FEE_ADMIN).
2. The tab shows: every registered service (live bps, hard cap, enforcement point), the
   network's fee treasury, the Polymarket bps the gateway is actually serving (with its
   `source`), and the OpenSea referral status (display-only, never a member cost).
3. Cross-check the gateway directly: `curl -s $GATEWAY/status | jq .fees` — expect
   `polymarket.source == "chain"` on a healthy Polygon setup. `"env-fallback"` means the router
   is unset or unreadable (see Diagnostics).

## Change a fee rate

1. Fees tab → **Change a fee rate** → pick the service, enter the new bps (0..cap), confirm the
   wallet transaction. The contract refuses above-cap rates (`CapExceeded`).
2. **Verify** (all three within ~1 minute):
   - the tab's table shows the new rate and a new **Change history** row (you, old → new);
   - the member surface quotes it (Earn: open a vault deposit review — the fee line shows the
     new rate; Predict: `curl -s "$GATEWAY/v1/polymarket/137/fee-rate?token_id=<id>"` shows the
     new `builderTakerFeeBps` once the ~30 s gateway cache turns over);
   - `FeeBpsChanged` is on the explorer (Fees tab → "Full history on the block explorer").
3. In-flight member actions are protected: anyone quoted the old rate either pays at most the
   quoted rate or their transaction reverts (`FeeAboveQuoted`) and they re-review. No follow-up
   needed.

## Emergency-zero a fee

Use when a fee is mischarging, a disclosure mismatch is reported, or comms require it.

1. Fees tab → set the affected service's rate to **0** → confirm. Effect is immediate for all
   subsequent actions: no fee transfer, no fee line.
2. If the UI is unavailable, from any FEE_ADMIN key:
   ```bash
   npx hardhat console --network <net>
   > const r = await ethers.getContractAt('FeeRouter', '<feeRouter addr>')
   > await r.setFeeBps(ethers.id('earn.lend'), 0)
   ```
   (Cold FEE_ADMIN key: follow the floppy-keystore signing flow, as for any admin action.)
3. Verify as in "Change a fee rate". The change is recorded on-chain like any other.

## Change the treasury destination

1. Fees tab → **Change the fee treasury** (ADMIN only) → enter the new FairWins-controlled
   address → confirm. The contract refuses the zero address; `TreasuryChanged` is emitted.
2. Verify the next `FeeCharged` event's transfer lands at the new address.
3. If a network's treasury was never set (`unset — fees are skipped` in the tab): fees on that
   network are silently zero **by design** (never lost). Set it, then re-check member quotes
   still match expectations.

## Reconcile treasury receipts

Monthly (or on demand):

1. Export `FeeCharged` events for the period (explorer CSV, or
   `feeRouter.queryFilter(feeRouter.filters.FeeCharged(), fromBlock, toBlock)`).
2. Sum `feeAmount` per asset; compare against the treasury address's incoming ERC-20 transfers
   **from the FeeRouter** for the same period. They must match exactly — every `FeeCharged`
   equals one same-tx transfer.
3. Any mismatch is an incident: freeze rate changes, capture the diverging txs, escalate per the
   security process. (The contract's invariant makes divergence impossible without a bug or an
   unexpected upgrade — check `feeRouterImpl` against `deployments/`.)
4. Polymarket builder-fee revenue arrives via Polymarket's builder program, not the treasury —
   reconcile it from Polymarket's builder dashboard as in the Predict runbook.

## Diagnostics: disclosure/charge mismatch or wrong source

Symptoms: member reports a fee different from the confirm screen; Predict shows
`source: "env-fallback"` unexpectedly; Earn deposits blocked with "fee rate could not be
confirmed".

1. **Which layer?** Earn quotes read the chain directly from the browser; Predict reads the
   gateway. `curl -s $GATEWAY/status | jq .fees` and compare with the Fees tab (direct chain
   read).
2. `source: "env-fallback"`:
   - `FEE_ROUTER_ADDRESS` unset on the gateway → set it (or redeploy with a deployments record
     containing `feeRouter`); the boot log fails loudly if it contradicts the record;
   - Polygon RPC trouble → check the gateway's chain health in `/status.chains`; the reader
     serves the last good value up to 10× the TTL, then falls back to env bps (which are the
     spec-057-capped defaults — never higher than disclosed caps).
3. Earn "deposits paused": the browser could not read the router on a network that has one —
   almost always RPC. Confirm with the Fees tab on the same network; deposits self-restore when
   the read succeeds. This is fail-safe behavior (never show an understated rate), not an outage
   of member funds; withdrawals are unaffected.
4. A member charged above the shown rate should be **impossible** (`maxFeeBps` + caps). Treat
   any credible report as a security incident: emergency-zero the service, capture the tx hash,
   compare the tx's `FeeCharged` args against the quoted rate, escalate.

## Registering a new service

Engineering-led — see the developer guide
([platform-fees.md](../developer-guide/platform-fees.md)). Operations involvement: confirm the
cap, set the initial rate (it registers at 0), and add the service to fee reconciliation.
