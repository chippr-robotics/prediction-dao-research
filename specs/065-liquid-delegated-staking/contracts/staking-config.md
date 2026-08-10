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
    validators: CURATED_POLYGON_VALIDATORS,   // curated allowlist — hard boundary (FR-008); see below
  },
}
```

## Curated Polygon validator allowlist (`config/staking.js` → `CURATED_POLYGON_VALIDATORS`)

Delegated staking targets are a **fixed, curated allowlist** (FR-008) — never free-form or the full
API list. The set below was drawn from the live official API (`…/api/v2/validators`, 105 validators)
and filtered to: `status: active` + `currentState: HEALTHY`, `delegationEnabled: true`, strong uptime
(≥ ~99.8%), reasonable commission (0–12%, excludes ~100%-commission delegate-hostile validators), a
named/reputable operator, and spread across distinct entities and pool sizes. Addresses are the
API-returned EIP-55-checksummed `contractAddress` (the `buyVoucherPOL` target) — copied verbatim, not
hand-typed; still run each through `getAddress()` at config-load as a safety net. **Key config on
`validatorId`, not name.**

| validatorId | name | validatorShare (ValidatorShare) | commission% |
|---|---|---|---|
| 47 | Kiln | `0xD14a87025109013B0a2354a775cB335F926Af65A` | 5 |
| 87 | Figment | `0xb929B89153fC2eEd442e81E5A1add4e2fa39028f` | 8 |
| 77 | Everstake | `0xF30Cf4ed712D3734161fDAab5B1DBb49Fd2D0E5c` | 0 |
| 121 | Stakin | `0xC7757805B983eE1b6272c1840c18e66837dE858E` | 1 |
| 162 | P2P.org | `0x15C2b3AdcA66E26B6F230b4023f52a285b7f9995` | 0 |
| 123 | stake.fish | `0x11cc04dD962e82D411587c56b815E8f8141Eb7D5` | 4 |
| 18 | Luganodes | `0xa6e768fEf2D1aF36c0cfdb276422E7881a83e951` | 10 |
| 106 | Chorus One | `0xD9E6987D77bf2c6d0647b8181fd68A259f838C36` | 12 |

**Vetted alternates** (same criteria; swap-in if a primary degrades): 88 Kraken
`0x41472fDdbAEc17E2a98F125Cacf8f76F919EA095` (10%) · 143 Blockdaemon
`0x875e901465A639f2E71fcfC10F426eD32F5A909a` (10%) · 148 Twinstake
`0xeA077b10A0eD33e4F68Edb2655C18FDA38F84712` (5%) · 110 Allnodes
`0x8f846C443CFa44A6e95aaCD2aC362b6cF4fd4335` (0%) · 64 DSRV
`0x5DDBeE6aD14852d5F78b6eeb6b040391821ff45C` (5%). (Coinbase id 142 / Binance id 137 are reputable but
excluded from the primary set on decentralization/size grounds — the two largest, exchange-custodied.)

**Build-time revalidation (required — commission/state are live, per-checkpoint):** before pinning
config, re-read the API for each `validatorId` and confirm still `HEALTHY` + `delegationEnabled` +
commission unchanged; ideally verify commission on-chain too (operators can change it). Drop or swap in
an alternate for any that regressed. The API returns **no APR field** — compute/show yield separately
with freshness. At runtime the allowlist is the hard boundary; the API only decorates allowlisted
entries with live commission/status, and an allowlisted validator reported not-accepting is shown
exit-only, never as a new-stake target.

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
