# Migrate to Polymarket Testnet (Polygon Amoy) for E2E Side-Bet Settlement

## Context

The `etc-swap` integration was deferred because the app sits on **Ethereum Classic Mordor (chain 63)** while Polymarket lives on **Polygon (chain 137 prod / 80002 Amoy testnet)**. Friend-market side bets that settle by referenced lookup against a Polymarket condition cannot work cross-chain without a bridge — yet the resolution-by-Polymarket plumbing is already 80% built (`PolymarketOracleAdapter`, `pegToPolymarketCondition`, `resolveFromPolymarket`, `batchResolveFromPolymarket`, `ResolutionType.PolymarketOracle` enum value, `polymarketConditionId` field on `FriendMarket`).

The unblock is to **co-locate on Polygon Amoy (Polymarket's testnet)** so the existing settle-by-reference path runs natively. Mordor stays live but is labeled limited functionality. Stablecoin acceptance switches to **Polymarket testnet USDC** so friend-market collateral is the same token Polymarket settles in. The previously-deferred swap layer generalizes from `ETCSwapV3Integration` to a chain-agnostic `DexV3Integration`, deployable against ETCSwap on Mordor and Uniswap V3 (or fork) on Amoy.

Outcome: a user can create a private friend-market wager on Amoy, peg it to a Polymarket Amoy `conditionId`, and have it settle automatically when Polymarket resolves — all in USDC, end to end.

---

## Confirmed scope

- **Target testnet**: Polygon Amoy (chain `80002`).
- **Stablecoin**: Polymarket testnet USDC on Amoy (single token for collateral and settlement reference).
- **Mordor**: keep deployed, label as limited; gate Polymarket-pegging UI behind a capability check.
- **Swap layer**: rename to chain-agnostic `DexV3Integration`; support Uniswap V3 (or fork) on Amoy. Skip if no V3 deployment is available — friend-market settle-by-reference does not require the DEX path.

---

## Step 1 — Generalize the swap integration

**Rename** (source-only; existing Mordor `ETCSwapV3Integration` deployment stays as-is):

- `contracts/integrations/ETCSwapV3Integration.sol` → `contracts/integrations/DexV3Integration.sol` (rename file + `contract` identifier; constructor `(address _factory, address _swapRouter, address _positionManager)` unchanged; no chain assumptions exist in the body — confirmed by exploration)
- Add `contracts/integrations/legacy/ETCSwapV3Integration.sol` — empty subclass shim so out-of-tree imports still compile

**`contracts/markets/ConditionalMarketFactory.sol`** (touchpoints from exploration):
- Line 120: `etcSwapIntegration` → `dexIntegration`
- Line 121: `useETCSwap` → `useDex`
- Lines 301–306: `setETCSwapIntegration(address,bool)` → `setDexIntegration(address,bool)` (keep old name as forwarding alias for one release)
- Lines 717, 844: branching `if (useETCSwap && address(etcSwapIntegration) != address(0))` → `useDex` / `dexIntegration`
- Lines 203, 205: events `ETCSwapIntegrationUpdated`/`ETCSwapPoolsCreated` → `DexIntegrationUpdated`/`DexPoolsCreated` (emit both for one release)
- Line 395–415: `createETCSwapPools` → `createDexPools` (alias forwarder retained)

**Storage layout note**: identifier-only renames preserve slot order; safe whether we redeploy or upgrade. Recommend redeploy on Mordor since it is a testnet.

**Tests touched**: `test/ETCSwapV3Integration.test.js`, `test/integration/etcswap/etcswap-trading.test.js` — pass-through via shim, no behavior change required.

---

## Step 2 — Deployment infrastructure

**`hardhat.config.js`** (after the existing `mordor` block at lines 237–243):
```js
amoy: {
  url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
  chainId: 80002,
  accounts: floppyKeys,
},
```
Add `etherscan.apiKey.amoy` and `customChains` entry pointing at `https://api-amoy.polygonscan.com/api`.

**`scripts/deploy/lib/constants.js`**:
- Extend `MAINNET_CHAIN_IDS` from `[1, 61]` to `[1, 61, 137]` (block accidental Polygon mainnet deploys)
- Add `TOKENS.amoy = { USDC: process.env.AMOY_USDC, WMATIC: "0x0ae6...verify" }`
- Add `POLYMARKET_CTF = { amoy: process.env.AMOY_POLYMARKET_CTF }`
- Add `NETWORK_CONFIG.amoy`

**`scripts/deploy/03-deploy-markets.js`** — generalize stablecoin lookup at lines 139, 161, 172, 225, 237:
```js
const stable = TOKENS[networkName]?.USDC ?? TOKENS[networkName]?.USC;
```

**`scripts/deploy/02-deploy-rbac.js`** — **audit tier-price decimal encoding**. If prices use `parseEther("50")` (18-dec) but the stablecoin is 6-dec, the on-chain price is 1e12× too large. USC and USDC are both 6-dec, so the existing Mordor deployment masks any latent bug. Fix to `parseUnits(price, stableDecimals)` keyed off chain stablecoin.

**`package.json`** — add scripts:
```json
"deploy:amoy": "hardhat run scripts/deploy/deploy-deterministic.js --network amoy",
"sync:frontend-contracts:amoy": "node scripts/utils/sync-frontend-contracts.js --network amoy --chainId 80002",
"seed:amoy": "hardhat run scripts/operations/seed-testnet.js --network amoy"
```

**Risks**:
- **Polymarket Amoy CTF address** — confirm from `docs.polymarket.com` or `Polymarket/conditional-tokens-contracts` GitHub at deploy time. Held in `AMOY_POLYMARKET_CTF` env var so it's overridable. **Fallback**: if Polymarket has not maintained Amoy, deploy `contracts/test/MockPolymarketCTF.sol` ourselves and treat it as the canonical Polymarket-shaped oracle for testnet.
- **Polymarket Amoy USDC** — same: held in `AMOY_USDC` env var; verify from Polymarket docs. Faucet must be available.
- **Uniswap V3 on Amoy** — no official Uniswap V3 deployment on Amoy exists. Options: (a) use a community fork, (b) deploy `@uniswap/v3-core` + `@uniswap/v3-periphery` ourselves, (c) ship without DEX on Amoy. Set `AMOY_UNIV3_*` env vars; deploy script skips `DexV3Integration` on Amoy if any are missing. The side-bet smoke test does not need DEX.

---

## Step 3 — Per-chain frontend config

**Create `frontend/src/config/networks.js`** as the single source of truth:
```js
export const NETWORKS = {
  61: { /* ETC mainnet — read-only */ },
  63: {
    chainId: 63, name: 'Mordor', isTestnet: true, isPrimary: false, limitedFunctionality: true,
    nativeCurrency: { symbol: 'METC', decimals: 18, name: 'Mordor Ether' },
    rpcUrl: import.meta.env.VITE_RPC_URL_MORDOR || 'https://rpc.mordor.etccooperative.org',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    stablecoin: { address: '0xDE093684c796204224BC081f937aa059D903c52a', symbol: 'USC', decimals: 6 },
    dex: { factory: '0x...', router: '0x...', positionManager: '0x...' },
    contracts: { /* paste current DEPLOYED_CONTRACTS */ },
    capabilities: { polymarketSidebets: false, dex: true, friendMarkets: true },
  },
  80002: {
    chainId: 80002, name: 'Polygon Amoy', isTestnet: true, isPrimary: true, limitedFunctionality: false,
    nativeCurrency: { symbol: 'MATIC', decimals: 18, name: 'MATIC' },
    rpcUrl: import.meta.env.VITE_RPC_URL_AMOY || 'https://rpc-amoy.polygon.technology',
    explorer: { name: 'Polygonscan', baseUrl: 'https://amoy.polygonscan.com' },
    stablecoin: { address: import.meta.env.VITE_AMOY_USDC, symbol: 'USDC', decimals: 6 },
    dex: null, // populated only if Uniswap V3 deployed
    contracts: { /* populated by sync:frontend-contracts:amoy */ },
    polymarket: { ctf: import.meta.env.VITE_AMOY_POLYMARKET_CTF },
    capabilities: { polymarketSidebets: true, dex: false, friendMarkets: true },
  },
  1337: { /* hardhat */ },
};
export const PRIMARY_CHAIN_ID = 80002;
export function getNetwork(chainId) { return NETWORKS[chainId] ?? NETWORKS[PRIMARY_CHAIN_ID]; }
export function getCurrentChainId() {
  const env = import.meta.env.VITE_NETWORK_ID;
  return env ? parseInt(env, 10) : PRIMARY_CHAIN_ID;
}
```

**Refactor (minimal-diff) the consumers** to derive from `NETWORKS`:
- `frontend/src/wagmi.js` — replace inline chain defs with `Object.values(NETWORKS).map(toViemChain)`. Update `EXPECTED_CHAIN_ID` to call `getCurrentChainId()`.
- `frontend/src/thirdweb.js` — same pattern, derive `defineChain` entries.
- `frontend/src/config/contracts.js` — reroute `getContractAddress(name)` through `NETWORKS[currentChainId].contracts`. Keep `DEPLOYED_CONTRACTS` exported as `NETWORKS[63].contracts` for back-compat.
- `frontend/src/config/blockExplorer.js` — derive `BLOCKSCOUT_URLS` from `NETWORKS`. Add `getExplorerBaseUrl` alias (the term "blockscout" is now wrong on Amoy).
- `frontend/src/constants/etcswap.js` — keep file path (avoid touching every importer); rewrite body to derive from `NETWORKS[currentChainId].dex` + `.stablecoin`. Expose `isDexAvailable` flag for callers to branch on.

**`scripts/utils/sync-frontend-contracts.js`** — write into `NETWORKS[chainId].contracts` instead of flat `DEPLOYED_CONTRACTS`.

---

## Step 4 — Token-symbol abstraction in views

**Create `frontend/src/hooks/useChainTokens.js`**:
```js
import { useChainId } from 'wagmi'
import { getNetwork, getCurrentChainId } from '../config/networks'
export function useChainTokens() {
  const chainId = useChainId() || getCurrentChainId()
  const n = getNetwork(chainId)
  return {
    chainId,
    native: n.nativeCurrency.symbol,
    nativeDecimals: n.nativeCurrency.decimals,
    stable: n.stablecoin.symbol,
    stableAddress: n.stablecoin.address,
    stableDecimals: n.stablecoin.decimals,
    capabilities: n.capabilities,
    limitedFunctionality: n.limitedFunctionality,
  }
}
```

**Create `frontend/src/components/ui/NativeToken.jsx` and `StableToken.jsx`** — tiny components that render `useChainTokens().native` / `.stable`.

**Sweep hardcoded labels** (full list with line numbers from exploration):
- `LandingPage.jsx` lines 56, 122, 127, 227
- `ProposalDashboard.jsx` line 173
- `RolePurchaseScreen.jsx` lines 10, 12, 15-17, 445-458 (`PAYMENT_TOKEN='ETC'` constant → hook value)
- `ui/RolePurchaseModal.jsx` lines 24, 30, 36
- `ui/PremiumPurchaseModal.jsx` lines 55-81, 185
- `AdminPanel.jsx` lines 105, 335, 342, 367, 630, 837, 1050, 1072, 1088, 1097, 1114, 1148
- `fairwins/OnboardingTutorial.jsx` lines 110, 202-203
- `fairwins/SwapPanel.jsx` lines 334, 339
- `MyPositions.jsx` line 79
- `wallet/WalletButton.jsx` lines 1005-1006, 1046

**`frontend/src/hooks/useTierPrices.js`** — rename `USC_DECIMALS` → `STABLE_DECIMALS` sourced from `getNetwork(chainId).stablecoin.decimals`. No behavior change (USC and USDC both 6-dec).

---

## Step 5 — Limited-functionality gating for Mordor

**Create `frontend/src/components/ui/ChainCapabilityGate.jsx`**:
```jsx
export function ChainCapabilityGate({ capability, fallback, children }) {
  const { capabilities } = useChainTokens()
  if (!capabilities?.[capability]) return fallback ?? <DisabledNotice capability={capability} />
  return children
}
```

**Create `frontend/src/components/ui/LimitedFunctionalityBanner.jsx`** — top-of-app banner shown when `useChainTokens().limitedFunctionality === true`. Copy: *"You're connected to Mordor (ETC testnet). Polymarket-pegged side bets aren't available here — switch to Polygon Amoy for full functionality."* Includes a `useSwitchChain({ chainId: 80002 })` button.

**Mount the banner** in `frontend/src/App.jsx` (root layout — confirm exact file at edit time).

**Wrap Polymarket-pegging UI** with `<ChainCapabilityGate capability="polymarketSidebets">`. Search `frontend/src/` for `pegToPolymarketCondition` and `polymarketConditionId` — primary call sites:
- `frontend/src/hooks/useFriendMarketCreation.js`
- The friend-market creation modal in `frontend/src/components/fairwins/` (concrete file at edit time)

The gate wraps only the *Polymarket peg* UI block; other resolution types (Either, Initiator, Receiver, ThirdParty) stay available on Mordor.

---

## Step 6 — Stablecoin acceptance on Amoy

Once `TOKENS.amoy.USDC` is set (Step 2) and `03-deploy-markets.js` is generalized, deployment auto-wires:
- `MembershipPaymentManager.addAcceptedPaymentToken(USDC, true)`
- `FriendGroupMarketFactory.setDefaultCollateralToken(USDC)`

**Verify after deploy**:
```
friendGroupMarketFactory.defaultCollateralToken() == AMOY_USDC
friendGroupMarketFactory.acceptedPaymentTokens(AMOY_USDC) == true
```

Audit `02-deploy-rbac.js` for tier-price decimal encoding (Step 2 risk).

---

## Step 7 — Polymarket adapter on Amoy

`contracts/oracles/PolymarketOracleAdapter.sol` is fully chain-agnostic — constructor takes `_polymarketCTF` (line 90). No contract change needed.

**`scripts/deploy/04-deploy-registries.js`** — add Polymarket adapter deploy when `POLYMARKET_CTF[networkName]` is set:
```js
const adapter = await deployDeterministic("PolymarketOracleAdapter", [ctf], salt, deployer);
const POLYMARKET_ID = ethers.keccak256(ethers.toUtf8Bytes("POLYMARKET"));
await oracleRegistry.registerAdapter(POLYMARKET_ID, adapter.address);
```

**`scripts/deploy/05-configure.js`** — wire into factory:
```js
await friendGroupMarketFactory.setPolymarketAdapter(deployments.polymarketOracleAdapter);
```

Reuses: `OracleRegistry.registerAdapter(bytes32,address)` (line 84), `FriendGroupMarketFactory.setPolymarketAdapter(address)` (line 549).

---

## Step 8 — End-to-end test for the side-bet flow

**Create `test/integration/oracle/amoy-private-sidebet.test.js`** — reuses scaffolding from `test/PolymarketOracleAdapter.test.js`, `test/FriendGroupMarketFactory.OracleIntegration.test.js`, `test/helpers/deployFriendGroupFactory.js`, `contracts/test/MockPolymarketCTF.sol`.

**Test path** (one new test file; existing UMA/Chainlink integration tests are not enough — they exercise *different* adapters):
1. Deploy `MockPolymarketCTF`, `PolymarketOracleAdapter(mockCTF)`, register in `OracleRegistry` under `keccak256("POLYMARKET")`, `friendGroupFactory.setPolymarketAdapter(adapter)`
2. `mockCTF.prepareCondition(oracle, questionId, 2)`; compute `conditionId` via `adapter.computeConditionId(...)`
3. Create a friend market between two wallets; both accept and stake USDC
4. `friendGroupFactory.pegToPolymarketCondition(friendMarketId, conditionId)`
5. `mockCTF.reportPayouts(questionId, [1, 0])` — Polymarket says PASS wins
6. `friendGroupFactory.resolveFromPolymarket(friendMarketId)` — auto-settles friend market
7. Winner calls `claimWinnings(friendMarketId)`; verify USDC arrives
8. Second test: `batchResolveFromPolymarket(conditionId)` resolves multiple markets sharing one condition

**Optional** `test/integration/oracle/amoy-fork-polymarket.test.js` — hardhat-fork test against real Amoy RPC, gated by `RUN_FORK_TESTS=true`. Useful once Amoy CTF address is confirmed live.

---

## Step 9 — Verification (run end-to-end)

```bash
# A. Contracts
npm run compile
npm run test test/integration/oracle/amoy-private-sidebet.test.js

# B. Deploy
export AMOY_RPC_URL=https://rpc-amoy.polygon.technology
export AMOY_USDC=<polymarket-amoy-usdc>
export AMOY_POLYMARKET_CTF=<polymarket-amoy-ctf>
export FLOPPY_KEYSTORE_PASSWORD=<password>
npm run deploy:amoy
npm run sync:frontend-contracts:amoy

# C. Frontend on Amoy
VITE_NETWORK_ID=80002 \
VITE_AMOY_USDC=$AMOY_USDC \
VITE_AMOY_POLYMARKET_CTF=$AMOY_POLYMARKET_CTF \
  npm run frontend
```

**Manual smoke**:
1. MetaMask → Polygon Amoy. Faucet MATIC + Polymarket-Amoy USDC.
2. Buy Bronze membership — verify price label reads `USDC`, not `USC`.
3. Create private friend market with another wallet; both stake.
4. Choose **Peg to Polymarket condition**, paste a known Amoy `conditionId`.
5. Wait for Polymarket resolution (or call `mockCTF.reportPayouts` via script).
6. Click **Settle from Polymarket** → `resolveFromPolymarket` succeeds.
7. Winner clicks **Claim** → USDC received.

**Mordor regression** (`VITE_NETWORK_ID=63 npm run frontend`):
- Limited-functionality banner shows.
- Non-Polymarket friend markets create/resolve normally.
- "Peg to Polymarket" UI is gated with copy directing user to Amoy.
- USC membership purchases still work.

---

## Out of scope

- Cross-chain bridging Mordor ↔ Amoy.
- Polygon mainnet (137) deployment — explicitly blocked via `MAINNET_CHAIN_IDS`.
- ETC Swap deprecation on Mordor (existing on-chain integration left alone).
- UI rewrite or i18n.
- Renaming `frontend/src/constants/etcswap.js` filepath.
- Redeploying Chainlink/UMA adapters on Amoy.

---

## Critical files

| File | Role |
|---|---|
| `contracts/integrations/DexV3Integration.sol` (new from rename) | Chain-agnostic V3 swap integration |
| `contracts/markets/ConditionalMarketFactory.sol` | ETCSwap → Dex rename + alias methods |
| `contracts/oracles/PolymarketOracleAdapter.sol` | Unchanged; deployed fresh on Amoy with Amoy CTF |
| `hardhat.config.js` | Add `amoy` network |
| `scripts/deploy/lib/constants.js` | `TOKENS.amoy`, `POLYMARKET_CTF`, `MAINNET_CHAIN_IDS+=137` |
| `scripts/deploy/02-deploy-rbac.js` | Audit/fix tier-price decimal encoding |
| `scripts/deploy/03-deploy-markets.js` | Generalize stablecoin lookup |
| `scripts/deploy/04-deploy-registries.js` | Polymarket adapter deploy |
| `scripts/deploy/05-configure.js` | Wire adapter into factory |
| `package.json` | `deploy:amoy`, `sync:frontend-contracts:amoy`, `seed:amoy` |
| `frontend/src/config/networks.js` (new) | Single source of truth for per-chain config |
| `frontend/src/hooks/useChainTokens.js` (new) | Symbol/decimals abstraction |
| `frontend/src/components/ui/ChainCapabilityGate.jsx` (new) | Mordor feature-gate wrapper |
| `frontend/src/components/ui/LimitedFunctionalityBanner.jsx` (new) | Mordor banner |
| `test/integration/oracle/amoy-private-sidebet.test.js` (new) | E2E side-bet settlement test |

## Execution order
1. Contract rename + factory updates → unit tests green via shim
2. Deploy infra (`hardhat.config.js`, `constants.js`, `package.json`, deploy scripts) + tier-price decimal audit
3. Frontend `networks.js` config refactor
4. Frontend symbol abstraction sweep + Mordor gating (parallelizable with 3)
5. New E2E test
6. `deploy:amoy` + smoke test on Amoy + Mordor regression
