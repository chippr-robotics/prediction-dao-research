# Contract: Mordor Deployment Record (`deployments/mordor-chain63-v2.json`)

The source-of-truth record written by `scripts/deploy/deploy.js` and consumed by `scripts/utils/sync-frontend-contracts.js`. This is the **core-only** shape: no oracle adapters, no mocks.

## Schema

```jsonc
{
  "network": "mordor",                 // string, required
  "chainId": 63,                       // number, required, == 63
  "deployer": "0x…",                   // address, required (admin key)
  "treasury": "0x…",                   // address, required (TREASURY env or deployer)
  "paymentToken": "0x…",               // address, required — REAL Classic USD (USC) on Mordor
  "wmatic": "0x…",                     // address|null — REAL WETC if allowlisted, else null (NO mock)
  "polymarketCTF": null,               // null — no Polymarket on ETC
  "contracts": {                       // object, required — CORE ONLY
    "wagerRegistry": "0x…",
    "membershipManager": "0x…",
    "keyRegistry": "0x…",
    "sanctionsGuard": "0x…"
    // NO polymarketAdapter / chainlink*Adapter / umaAdapter
  },
  "mocks": null,                       // MUST be null — no mocks shipped (Constitution III)
  "saltPrefix": "FairWins-P2P-v2.0-",  // string
  "timestamp": "2026-06-16T…Z"         // ISO 8601
}
```

## Invariants (assertions for validation)

- `chainId === 63` and `network === "mordor"`.
- `paymentToken` is a real on-chain Classic USD contract on Mordor (matches `stablecoin.address` in `networks.js`); it is **never** a freshly deployed `MockERC20`.
- `mocks === null` and `contracts.polymarketAdapter` is absent.
- `contracts` contains exactly the four core keys, each a valid `0x`-prefixed 40-hex address with live bytecode on Mordor.
- Sanctions Guard is wired into `WagerRegistry` (enforced, not disabled).

## Consumer mapping (`sync-frontend-contracts.js`)

`--chainId 63` → block `MORDOR_CONTRACTS`. v2 mapping writes `wagerRegistry, membershipManager, keyRegistry, sanctionsGuard, paymentToken` (oracle keys absent → not written → capability tags grey). The block MUST be pre-reset to the v2 shape so legacy v1 keys do not orphan.
