# Contract: Staking config & capability (spec 065)

The UI contract for per-network staking availability. Mirrors the spec-050 `earn` block and the `dex`
config pattern: external-protocol addresses live in config (not `deployments/` sync artifacts, since
Lido/Polygon are not FairWins deployments), and a `capabilities.staking` flag lets the UI self-gate.

## `NETWORKS[chainId].staking` block

```text
staking: {
  liquid: [                                   // [] / absent ⇒ no liquid option on this chain
    { kind: 'lido',                           // ETH liquid staking (research.md R1)
      provider: { name: 'Lido', url: 'https://stake.lido.fi' },
      asset: { symbol: 'ETH', decimals: 18 }, lstSymbol: 'wstETH',
      referral: '0x…',                        // FairWins attribution address (tracking only, no revenue)
      contracts: { steth: '0x…', wsteth: '0x…', withdrawalQueue: '0x…' },
      aprApi: 'https://eth-api.lido.fi/v1/protocol/steth/apr/sma',
      unbonding: { kind: 'queue', instantExit: false } },
    { kind: 'spol',                           // POL liquid staking — Polygon official native LST (research.md R2)
      provider: { name: 'sPOL (Polygon)', url: 'https://staking.polygon.technology/lst' },
      asset: { symbol: 'POL', decimals: 18 }, lstSymbol: 'sPOL',
      referral: null,                         // sPOL has no referral param
      contracts: { token: '0x3B790d651e950497c7723D47B24E6f61534f7969',
                   controller: '0xEaadA411F2600570796c341552b9869DA708a28B' },
      aprApi: null,                           // derived on-chain from convert* rate drift
      unbonding: { kind: 'checkpoints', instantExit: true } },  // ~80 checkpoints; DEX swap for instant exit
  ],
  delegated: {                                // omit/null ⇒ no delegated option
    provider: { name: 'Polygon PoS', url: 'https://staking.polygon.technology' },
    stakeManager: '0x…',                      // reads epoch()/withdrawalDelay() at runtime
    stakingApi: 'https://staking-api.polygon.technology/api/v2/validators',
    validators: [ { validatorId, validatorShare: '0x…', name } ],   // curated allowlist — hard boundary (FR-008)
  },
}
```

- **Chain 1 (Ethereum mainnet)**: `liquid` = [Lido (ETH), sPOL (POL)]; `delegated` = Polygon POL
  validator delegation (Polygon staking + sPOL canonical mint both live on Ethereum L1). All options
  available.
- **Chain 137 (Polygon)**: `staking` **absent** at launch. The Polygon-PoS-native sPOL deposit path
  (`sPOLChild`, cross-chain settle) is a documented follow-up (research.md R2); until then chain 137
  is the honest unavailable state.
- All other chains (ETC/Mordor, Bitcoin, Solana, testnets): `staking` absent.
- Verify all addresses at build time (Lido deployed-contracts page; `0xPolygon/spol-contracts`).

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
