# Contract: Staking config & capability (spec 065)

The UI contract for per-network staking availability. Mirrors the spec-050 `earn` block and the `dex`
config pattern: external-protocol addresses live in config (not `deployments/` sync artifacts, since
Lido/Polygon are not FairWins deployments), and a `capabilities.staking` flag lets the UI self-gate.

## `NETWORKS[chainId].staking` block

```text
staking: {
  liquid: {                                   // omit/null ⇒ no liquid option on this chain
    provider: { name: 'Lido', url: 'https://stake.lido.fi' },
    referral: '0x…',                          // FairWins attribution address (tracking only, no revenue — research.md R1)
    contracts: { steth: '0x…', wsteth: '0x…', withdrawalQueue: '0x…' },
    aprApi: 'https://eth-api.lido.fi/v1/protocol/steth/apr/sma',
  },
  delegated: {                                // omit/null ⇒ no delegated option
    provider: { name: 'Polygon PoS', url: 'https://staking.polygon.technology' },
    stakeManager: '0x…',                      // reads epoch()/withdrawalDelay() at runtime
    stakingApi: 'https://staking-api.polygon.technology/api/v2/validators',
    validators: [ { validatorId, validatorShare: '0x…', name } ],   // curated allowlist — hard boundary (FR-008)
  },
}
```

- **Chain 1 (Ethereum mainnet)**: `liquid` = Lido; `delegated` = Polygon POL delegation (the Polygon
  staking contracts are on L1). Both models available.
- **Chain 137 (Polygon)**: `staking` **absent** at launch — no deposits-open LST provider (research.md
  R2). Honest unavailable state.
- All other chains (ETC/Mordor, Bitcoin, Solana, testnets): `staking` absent.

## Capability + helpers (`config/networks.js`, `config/staking.js`)

```text
capabilities.staking = Boolean(this.staking)          // added to each network's capabilities getter

isStakingAvailable(chainId)    → boolean              // Boolean(getStakingConfig(chainId))
getStakingConfig(chainId)      → staking block | null
getStakingNetworks()           → string[]             // names of staking-enabled networks (honest copy)
getStakingOptionsConfig(chainId) → { liquid, delegated } normalized for useStakingOptions
stakingPath({ chainId, tokenSymbol }) → '/wallet?tab=earn&view=stake[&chain=][&token=]'
```

## Behavioural contract

- `capabilities.staking` false ⇒ the Stake area renders the honest unavailable state naming
  `getStakingNetworks()`; the portfolio `stake` action is disabled with a plain reason. Never a dead
  control (constitution III).
- Validator targets are read **only** from `validators[]`; the Polygon staking API may enrich an
  allowlisted entry (commission/APR/status) but a validator not in the allowlist is never surfaced or
  callable.
- Addresses are config constants (external protocol), consumed the same way as `earn`/`dex` config.
