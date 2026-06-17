# Feature Specification: Mordor Network Deployment

**Feature Branch**: `015-mordor-network-deployment`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "deploy the smart contracts for fairwins onto the mordor network using the admin key. we need to use classic usd and etcswap for the stable coin and make appropriate accommodations and documentation for the network on the network tab."

## Clarifications

### Session 2026-06-16

- Q: Which of the v2 contracts should be deployed on Mordor? → A: Core only — the wager registry, membership manager, key registry, and sanctions guard. The Polymarket, Chainlink, and UMA oracle adapters are NOT deployed on Mordor.
- Q: How should Classic USD be sourced on the Mordor testnet? → A: Reuse the existing canonical Classic USD already deployed on Mordor only. No test/mock stablecoin is deployed, and the feature is blocked if no canonical Classic USD exists on Mordor.
- Q: Should the Sanctions Guard (OFAC screening) be enforced on Mordor? → A: Yes — deploy and enforce it the same as the other networks (no relaxed/non-blocking testnet mode).
- Q: What happens to the legacy v1 Mordor deployment when v2 is deployed? → A: The v2 deployment replaces it — active config holds the v2 addresses and legacy v1 read-only Mordor support is retired (old records remain only in version-control/deployment history).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy the FairWins contract suite to Mordor with the admin key (Priority: P1)

An authorized project operator deploys the Ethereum-Classic-compatible v2 contract subset to the Mordor network (the Ethereum Classic test network) using the project's secured admin key. The deployment wires the existing Classic USD as the wager stablecoin, records every deployed address as the source-of-truth deployment artifact, and updates the frontend's network/contract configuration from that artifact so the app can read Mordor on-chain state.

**Why this priority**: Nothing else in this feature can work until the contracts exist on Mordor and their addresses are recorded and wired into the app. This is the foundational, standalone slice — once complete, FairWins is live on Ethereum Classic's testnet even before any UI work, and the Network tab's capability tags (which derive from deployed addresses) light up automatically.

**Independent Test**: Run the deployment with the secured admin key, then confirm every deployed contract is live and inspectable on the Mordor block explorer, the deployment artifact lists all addresses, and the frontend configuration reflects those addresses — all without exposing any private key or secret.

**Acceptance Scenarios**:

1. **Given** the admin key is available through the secured keystore workflow and the deployer balance holds enough test ETC for gas, **When** the operator runs the deployment targeting Mordor, **Then** the core v2 contracts (wager registry, membership manager, key registry, sanctions guard) are deployed, the existing Classic USD is set as the payment token, and a Mordor deployment record is written listing every deployed address.
2. **Given** a completed Mordor deployment record exists, **When** the operator runs the frontend contract sync, **Then** the app's Mordor contract configuration is populated from the record (not hand-edited), points at the newly deployed addresses, and supersedes the legacy v1 Mordor configuration.
3. **Given** a deployment is in progress, **When** any step runs, **Then** no private key, mnemonic, or secret is committed to the repository or printed in logs.

---

### User Story 2 - Select Mordor and read its documentation on the Network tab (Priority: P2)

A FairWins user opens **My Account → Network**, sees Mordor offered as a selectable network card alongside the existing networks, and switches to it (the connected wallet prompts to confirm the chain change). The card's capability tags accurately reflect which FairWins features are live on Mordor, and the card surfaces Mordor-specific operational documentation: that it is an Ethereum Classic test network, its native currency (ETC), how to get test ETC (faucet), the block explorer, the stablecoin (Classic USD), and how to obtain/swap into Classic USD via ETCswap.

**Why this priority**: Once contracts are live (P1), users need a way to reach Mordor and understand how to operate there. Ethereum Classic differs enough from the existing networks (different native currency, stablecoin, explorer, and faucet) that accurate in-app guidance is what makes the network usable rather than confusing.

**Independent Test**: With the Mordor configuration present, open the Network tab, confirm a Mordor card appears with accurate capability tags and operational documentation, switch to Mordor, and confirm the app operates against Mordor without errors.

**Acceptance Scenarios**:

1. **Given** Mordor is registered as a selectable network, **When** the user opens the Network tab, **Then** a Mordor card appears, labeled as a Testnet, with a control to switch to it.
2. **Given** the Mordor card is shown, **When** the user reads its capability tags, **Then** each tag truthfully reflects what is deployed on Mordor: P2P Wagers, Memberships, Encrypted Wagers, and Sanctions Guard marked available; the Polymarket, Chainlink, and UMA oracle integrations marked unavailable; and Token Swap marked available only when ETCswap is configured.
3. **Given** the Mordor card is shown, **When** the user reads its documentation, **Then** it presents the native currency (ETC), how to obtain test ETC (faucet), the block explorer link, the stablecoin (Classic USD), and how to obtain/swap into Classic USD via ETCswap.
4. **Given** the user switches to Mordor, **When** the wallet confirms the chain change, **Then** the app activates Mordor and all balances, wagers, and membership shown are scoped to Mordor, clearly labeled as a test network, with nothing implying real-world value or mainnet finality.

---

### User Story 3 - Transact in Classic USD on Mordor with correct feature accommodations (Priority: P3)

A user operating on Mordor creates and accepts wagers denominated in Classic USD, optionally swapping native test ETC into Classic USD via ETCswap from inside the app. Features that cannot work on Ethereum Classic (Polymarket-referenced side bets and Chainlink/UMA oracle resolution) are hidden or clearly marked unavailable rather than failing, and only resolution methods that function on Mordor are offered.

**Why this priority**: This is the payoff — actual peer-to-peer wagering on Mordor — but it depends on both the deployment (P1) and the network being reachable in the UI (P2). It also requires honest handling of the capabilities Ethereum Classic does not offer.

**Independent Test**: On Mordor, fund an account with Classic USD (directly or via ETCswap), create and accept a wager in Classic USD through escrow → resolution → claim, and confirm that unavailable features are hidden or accurately flagged and that only supported resolution methods appear.

**Acceptance Scenarios**:

1. **Given** Mordor is active and the user holds Classic USD, **When** they create a wager, **Then** the stake is denominated in Classic USD and the wager is escrowed on Mordor.
2. **Given** Mordor is active and ETCswap liquidity exists for Classic USD, **When** the user swaps native test ETC for Classic USD in the app, **Then** they receive Classic USD usable for staking, consistent with the swap experience on other networks.
3. **Given** Mordor is active, **When** the user starts creating a wager, **Then** only resolution methods that function on Mordor (peer/designated-resolver) are offered and oracle-based methods are not presented.
4. **Given** Mordor is active, **When** the user encounters a feature that depends on a service unavailable on Ethereum Classic, **Then** that feature is hidden or shows accurate "not available on this network" messaging instead of erroring or silently doing nothing.
5. **Given** Mordor is active, **When** a sanctioned address attempts to participate, **Then** the Sanctions Guard blocks it exactly as on the other networks (screening is enforced, not relaxed, on the testnet).

---

### Edge Cases

- **No canonical Classic USD on Mordor**: If no existing Classic USD token is deployed on Mordor, the deployment is blocked and the feature does NOT ship a substitute mock/test stablecoin in its place.
- **Mordor RPC unreachable**: When the Mordor endpoint is down or unresponsive, the app surfaces a clear network-unavailable state rather than a broken or partially-rendered UI.
- **No ETCswap liquidity for Classic USD**: If a Classic USD ↔ native-currency swap path does not exist on Mordor, the Token Swap capability is marked unavailable and the in-app swap is hidden with accurate messaging; users can still bring their own Classic USD to stake.
- **Gas but no stablecoin**: A user holding test ETC for gas but no Classic USD is guided (via the Network tab documentation) to obtain Classic USD (faucet and/or swap) before attempting to stake.
- **Stablecoin decimals differ from other networks**: Classic USD amounts render and compute correctly even if its decimal precision differs from the stablecoins used on other networks.
- **Attempting an unsupported flow**: A user who reaches a Polymarket/Chainlink/UMA-based flow while on Mordor is blocked with accurate messaging rather than an obscure failure.
- **Switching networks mid-flow**: Switching from Mordor to another network (or back) correctly re-scopes all data with no stale Mordor balances, wagers, or membership leaking across the boundary.
- **Residual legacy v1 references**: After the v2 deployment supersedes v1, no legacy v1 Mordor addresses or data appear in the app.
- **Insufficient deployer funds**: If the deployer lacks enough test ETC at deploy time, the deployment fails clearly and records nothing partial as the source of truth.

## Requirements *(mandatory)*

### Functional Requirements

**Deployment (P1)**

- **FR-001**: System MUST deploy the Ethereum-Classic-compatible v2 contract subset to the Mordor network (Ethereum Classic test network, chain id 63): the wager registry, membership manager, key registry, and sanctions guard. The Polymarket, Chainlink, and UMA oracle adapters MUST NOT be deployed on Mordor.
- **FR-002**: The deployment MUST be authorized and executed with the project's secured admin key via the air-gapped keystore workflow, and MUST NOT commit or print any private key, mnemonic, or secret.
- **FR-003**: The Mordor deployment MUST configure Classic USD as the wager payment/stablecoin token, reusing the existing canonical Classic USD token already deployed on Mordor. No test or mock stablecoin is deployed; if no canonical Classic USD exists on Mordor, the deployment MUST be blocked rather than substituting a placeholder token.
- **FR-004**: The deployment MUST be recorded as a deployment artifact that lists every deployed address and serves as the source of truth for Mordor addresses, following the same structure as existing network deployment records.
- **FR-005**: The frontend's Mordor contract configuration MUST be generated from the recorded deployment artifact (not hand-copied or hardcoded), so the app reads Mordor addresses from the sync output.
- **FR-016**: The Sanctions Guard MUST be deployed and enforced on Mordor participation, consistent with the other networks; no relaxed or non-blocking testnet mode is used.
- **FR-017**: The Mordor v2 deployment MUST supersede the legacy v1 Mordor configuration: the app's active Mordor contract config MUST hold the new v2 addresses, legacy v1 read-only Mordor support MUST be retired, and no v1 addresses or data surface in the app. Prior v1 records remain only in version-control and deployment history.

**Network selection & documentation (P2)**

- **FR-006**: Mordor MUST be registered as a user-selectable network so it appears as a network card on the My Account → Network tab; switching to it MUST go through the connected wallet's chain-change confirmation.
- **FR-007**: The Mordor network card MUST display its identity and operational details: name, that it is an Ethereum Classic test network, native currency (ETC), the block explorer link, how to obtain test ETC (faucet), the stablecoin (Classic USD), and how to obtain/swap into Classic USD via ETCswap.
- **FR-008**: The Mordor card's capability tags MUST truthfully reflect what is deployed on Mordor, derived from the recorded deployment (not hardcoded): P2P Wagers, Memberships, Encrypted Wagers, and Sanctions Guard available; Polymarket/Chainlink/UMA oracle integrations unavailable; Token Swap available only when ETCswap is configured.
- **FR-009**: When Mordor is the active network, balances, wagers, and membership MUST be scoped exclusively to Mordor and MUST NOT leak to or from other networks; Mordor MUST be clearly labeled as a test network and MUST NOT imply real-world value or mainnet finality.

**Stablecoin & swap (Classic USD + ETCswap)**

- **FR-010**: Users MUST be able to denominate, create, and accept wagers in Classic USD when Mordor is the active network.
- **FR-011**: Users MUST be able to acquire Classic USD by swapping the native currency via the existing ETCswap deployment when Mordor is active and swap liquidity exists, consistent with the swap experience on other networks; when ETCswap/liquidity is absent the swap MUST be cleanly hidden rather than offered, and no mock DEX is deployed.

**Accommodations for Ethereum Classic (P3)**

- **FR-012**: Features that depend on services unavailable on Ethereum Classic (Polymarket-referenced side bets, Chainlink and UMA oracle resolution) MUST be hidden or shown as unavailable with truthful messaging when Mordor is active, never failing silently or implying support.
- **FR-013**: Wager creation on Mordor MUST offer only resolution methods that function on Mordor (peer/designated-resolver) and MUST NOT present oracle-based resolution types that Ethereum Classic cannot support.
- **FR-014**: The system MUST gracefully handle Mordor being unreachable, surfacing a clear network-unavailable state rather than a broken UI.

**Documentation**

- **FR-015**: Project documentation MUST be updated to reflect Mordor as a supported v2 test network, including its stablecoin (Classic USD), DEX (ETCswap), block explorer, faucet, the capability matrix (supported vs. unsupported features), and the retirement of the legacy v1 Mordor deployment.

### Key Entities *(include if feature involves data)*

- **Mordor Network Profile**: The configuration describing Mordor — chain id 63, display name, test-network flag, selectable flag, native currency (ETC), RPC endpoint, block explorer, stablecoin reference, DEX reference, and capability flags consumed by the Network tab.
- **Classic USD Stablecoin**: The existing canonical ERC-20 stablecoin reused as the wager payment token on Mordor (no mock/test token is deployed), with its symbol and decimal precision.
- **ETCswap DEX**: The existing swap/liquidity provider on Mordor enabling native-currency ↔ Classic USD swaps (and any wrapped-native asset it requires); reused, not mocked.
- **Mordor Deployment Record**: The recorded set of deployed v2 contract addresses on Mordor; the source of truth consumed by the frontend sync and, transitively, by the Network tab's capability tags. It replaces the legacy v1 Mordor record in active configuration.
- **FairWins Contract Suite (v2)**: The set of contracts deployed per network (wager registry, membership manager, key registry, sanctions guard, and oracle adapters), of which only the Ethereum-Classic-compatible subset — wager registry, membership manager, key registry, and sanctions guard — is deployed on Mordor; the oracle adapters are not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Mordor v2 contract set (wager registry, membership manager, key registry, sanctions guard) is live and inspectable on the Mordor block explorer, with 100% of deployed addresses recorded in the deployment artifact and the oracle adapters intentionally absent.
- **SC-002**: A user can find Mordor on the Network tab, read its details and documentation, and switch to it within the same session with no errors.
- **SC-003**: A user can complete a wager denominated in Classic USD on Mordor end-to-end (escrow → resolution → claim) on the testnet.
- **SC-004**: When ETCswap liquidity is available, a user can swap native test currency into Classic USD from within the app while Mordor is active.
- **SC-005**: 100% of the Mordor card's capability tags match what is actually deployed, and 100% of features unavailable on Mordor are hidden or display accurate "not available on this network" messaging; none fail silently or imply finality the chain has not reached.
- **SC-006**: No Mordor data appears while another network is active, no other network's data appears while Mordor is active, and no legacy v1 Mordor data appears anywhere (network isolation and v1 retirement verified).
- **SC-007**: The deployment is completed using the secured admin key with zero secrets committed to the repository or printed in logs.

## Assumptions

- "Classic USD" refers to the existing Ethereum Classic USD stablecoin (ticker commonly "USC") already deployed on Mordor; the plan MUST confirm and pin its canonical Mordor contract address before deployment. No test/mock stablecoin is deployed — if no canonical Classic USD exists on Mordor, the feature is blocked (see Dependencies). The repository previously referenced a USC stablecoin address with 6-decimal precision as a starting point for verification.
- "ETCswap" is the existing Uniswap-V3-style decentralized exchange on Ethereum Classic; the plan will confirm ETCswap's deployed contracts and Classic USD / wrapped-native liquidity on Mordor. ETCswap is reused, not mocked. If swap liquidity is unavailable, the Token Swap capability is cleanly disabled for Mordor while the rest of the feature still ships (still a valid MVP).
- Mordor is a public test network; deployed balances have no real-world value and the network is always presented to users as a testnet.
- Polymarket, Chainlink, and UMA oracle infrastructure are not available on Ethereum Classic, so oracle-based resolution and Polymarket-referenced side bets are out of scope for Mordor; peer/designated-resolver wagers are the supported model, and the corresponding oracle adapters are not deployed on Mordor.
- The existing v2 deployment script, deployment-record format, and frontend contract-sync tooling are reused; no new core technology is introduced for this feature.
- Native gas on Mordor is paid in test ETC, obtained from a public Mordor faucet.

## Dependencies

- Access to the project's secured admin key via the keystore workflow, and a Mordor deployer account funded with enough test ETC for gas.
- A reachable Mordor RPC endpoint and an available Mordor block explorer.
- **An existing canonical Classic USD token deployed on Mordor — a hard dependency; without it the feature cannot ship (no mock is substituted).**
- The ETCswap contract addresses and Classic USD / wrapped-native liquidity on Mordor — required only for the in-app swap; if absent, Token Swap is disabled and the rest of the feature still ships.
- The existing v2 contract suite, deploy script, deployment-record format, and frontend sync tooling, plus the My Account → Network tab and its capability-tag mechanism.
