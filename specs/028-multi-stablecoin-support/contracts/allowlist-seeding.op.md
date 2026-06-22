# Contract: Allow-list Seeding Operation

How curated stablecoins are admitted to the on-chain `WagerRegistry` allow-list. **Reuses existing contract entrypoints — no Solidity change.**

## Existing on-chain interface (unchanged)

```solidity
function setTokenAllowed(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE);
function isAllowedToken(address token) external view returns (bool);
event TokenAllowed(address indexed token, bool allowed);
```

`createWager` / `createOpenWager` revert with `NotAllowedToken()` if `token` is not allow-listed.

## Fresh deployments — `scripts/deploy/`

- Add curated mainnet addresses to `constants.js` `TOKENS[<network>]` (e.g. `USDT`, `EURC`).
- Include them in `initialize(...)` `initialTokens` so a new `WagerRegistry` is seeded at deploy.
- Deploy continues to read each token's `decimals()` on-chain (existing behavior); abort on unverified/zero addresses (mirrors `requireRealStablecoin`).

## Existing deployments — `scripts/ops/seed-stablecoins.js` (new)

Idempotent admin op (floppy-keystore / admin signer per key-management rules):

```
for each curated token on the target network:
  if !isAllowedToken(token):
     read symbol()/decimals() on-chain  → log + sanity-check (standard ERC-20, expected decimals)
     setTokenAllowed(token, true)         → emits TokenAllowed
  else: skip (already allowed)
```

## Operational contract

| ID | Requirement |
|----|-------------|
| O-1 | Op is idempotent: re-running adds nothing already allow-listed. (safe re-run) |
| O-2 | Op verifies each address on-chain (symbol/decimals) before allowing; aborts on mismatch or non-contract address. (Constitution III) |
| O-3 | Only `DEFAULT_ADMIN_ROLE` can seed; signer comes from the keystore flow; no private keys in logs. (key-management) |
| O-4 | Curated rationale (issuer, peg, GENIUS basis) is recorded in config/docs alongside the address. (FR-017) |
| O-5 | Mainnet seeding of a coin requires compliance/legal sign-off recorded before the tx. (FR-002, R3) |
| O-6 | Removing a coin (`setTokenAllowed(token,false)`) stops new wagers in it but leaves existing wagers settleable. (FR-016) |

## Sync to frontend

After seeding, the curated config (`networks.js` `stablecoins`) is the frontend's enumeration source; `npm run sync:frontend-contracts` continues to sync the default `paymentToken`. A config test asserts every curated frontend entry is intended to be allow-listed on its network (config/on-chain parity is an operational check, not a runtime call).
