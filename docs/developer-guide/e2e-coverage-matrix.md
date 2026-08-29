<!-- GENERATED FILE — do not edit by hand.
     Source: frontend/cypress/coverage/matrix.json
     Regenerate: npm run e2e:matrix -->

# End-to-End Coverage Matrix

Every directory under `specs/` appears here exactly once — including the ones with no member
surface, which carry a reason instead of flows. That is what makes the staleness gate a set
comparison rather than a judgement about which features "should" have been listed.

**Status** is what exists. **Depth** is what the tests prove, and it is a separate fact: a flow
can be `covered` at depth `smoke`, and several are. That combination is the finding, not a
contradiction — a test that passes when its precondition is absent reports as coverage while
proving nothing.

| Value | Status means | Depth means |
|---|---|---|
| 1 | 🟢 `covered` — tests prove the outcome | `settled` — read back from the authority that decides it (chain state, a balance) |
| 2 | 🟡 `partial` — a named part is unproven | `flow` — the journey completed and the interface agreed |
| 3 | 🔴 `absent` — nothing drives it | `smoke` — a surface rendered, a control existed |
| 4 | ⚪ `out-of-scope` — deliberately untested, with a reason | `none` — no test, or only assertions that cannot fail |

See [the tiering policy](./e2e-testing-policy.md) for what belongs in which tier.

## Totals

| Metric | Count |
|---|---|
| Spec directories | 103 |
| With a member-facing flow | 81 |
| Member-facing flows | 155 |
| 🟢 covered | 140 |
| 🟡 partial | 1 |
| 🔴 absent | 8 |
| ⚪ out of scope | 6 |
| **Covered but not proven** (status `covered`, depth below `flow`) | **13** |

The last row is the honest read of the suite: those flows have passing tests that do not
establish the outcome. They are listed in full at the end of this document.

## Custody — member funds are escrowed, moved, bridged, swept or sent

59 flows — 🟢 48 · 🟡 0 · 🔴 5 · ⚪ 6 · covered-but-not-proven 0

### `001-cypress-e2e-flows` — Core wager lifecycle (create → accept → resolve → claim/refund)

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.claim-payout` | The winner claims the escrowed stakes | 🟢 covered | settled | `on-chain` | `10-claim-payouts.cy.js` (CLM-01, CLM-02, CLM-03, CLM-04, CLM-05, CLM-06, CLM-07, CLM-08, CLM-09, CLM-10) |  |
| `wagers.refund-on-timeout` | An unaccepted or unresolved wager refunds after its deadline | 🟢 covered | settled | `on-chain` | `11-refund-timeout.cy.js` (REF-01, REF-02) |  |
| `wagers.decline-and-cancel` | Decline an offer, or cancel one you created before it is accepted | 🟢 covered | flow | `on-chain` | `06-decline-cancel.cy.js` (DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06) |  |
| `wagers.full-lifecycle` | One wager driven end to end, create through settlement | 🟢 covered | settled | `on-chain` | `23-lifecycle-e2e.cy.js` (E2E-01, E2E-02, E2E-03, E2E-04, E2E-05) |  |

### `003-polymarket-only-oracle-ui` — Polymarket-only oracle UI

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `oracle.auto-resolve-from-condition` | A resolved Polymarket condition settles the wager without either party acting | 🟢 covered | settled | `on-chain` | `08-oracle-resolution.cy.js` (ORC-01, ORC-02, ORC-03) |  |

### `004-draw-resolution` — Draw resolution

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.declare-draw` | An arbitrator declares a draw and both stakes are returned | 🟢 covered | settled | `on-chain` | `07-manual-resolution.cy.js` (RES-15, RES-16) |  |

### `022-membership-purchase-progress` — Membership purchase progress

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.purchase-progress` | Watch a membership purchase progress through its steps | 🟢 covered | flow | `on-chain` | `02-membership.cy.js` (MEM-04, MEM-05, MEM-06) |  |

### `024-open-challenge-wagers` — Open challenge wagers

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.create-open-challenge` | Post a wager anyone may accept | 🟢 covered | settled | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-09, CRE-10) |  |
| `wagers.accept-open-challenge` | Accept someone else's open challenge | 🟢 covered | settled | `on-chain` | `05-wager-acceptance.cy.js` (ACC-14, ACC-15) |  |

### `026-membership-vouchers` — Membership vouchers

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.redeem-voucher` | Redeem a voucher for membership without paying | 🟢 covered | settled | `on-chain` | `33-transfers-swap-vouchers.cy.js` (VC-01) |  |
| `membership.buy-voucher` | Buy a voucher at the tier price, paid in USDC | 🟢 covered | settled | `on-chain` | `33-transfers-swap-vouchers.cy.js` (VC-02) |  |
| `membership.send-voucher-from-portfolio` | Send/Gift a held FWMV voucher from the Portfolio asset sheet, voucher preselected | 🔴 absent | none | — (proposed: no-chain) | #1364 |  |

### `028-token-mint` — Token Mint mini-app

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.token-mint-deploy` | Mint a token through the Token Mint mini-app | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-04) |  |

### `030-clearpath-standard-daos` — ClearPath mini-app

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.clearpath-create-dao` | Create a standard DAO through ClearPath | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-06) | the flow covers what ships — registering an EXTERNAL DAO on the ExternalDAORegistry. Spec 030's pillar A (creating a native standard DAO) has no member surface: the OZ Governor was deferred for the pre-Cancun `mcopy` problem, so the id names more than the product does |

### `033-network-aware-swap` — Network-aware swap

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `trade.swap-quote-and-execute` | Swap one asset for another on the active network | 🟢 covered | settled | `on-chain` | `33-transfers-swap-vouchers.cy.js` (SW-01) |  |

### `034-zk-wager-pools` — Wager pools

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `pools.create-and-join` | Create a group pool and have members join with their stake | 🟢 covered | settled | `on-chain` | `24-wager-pools.cy.js` (POOL-01) |  |
| `pools.settle-payout-matrix` | Creator proposes a payout matrix, members approve to threshold, the winner claims | 🟢 covered | settled | `on-chain` | `24-wager-pools.cy.js` (POOL-02) |  |
| `pools.deadline-refund` | A pool that never resolves returns members' stakes after the deadline | 🟢 covered | settled | `on-chain` | `24-wager-pools.cy.js` (POOL-03) |  |
| `pools.join-with-authorization` | Join a pool gaslessly by signing an EIP-3009 authorization | 🟢 covered | settled | `on-chain` | `24-wager-pools.cy.js` (POOL-04) |  |

### `035-intent-based-payments` — Gasless intents

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `intents.sign-and-relay` | Authorize an action by signature and have a relayer submit it | 🟢 covered | settled | `on-chain` | `07-manual-resolution.cy.js` (RES-17, RES-18, RES-19) |  |

### `036-relayer-infrastructure` — Relayer gateway

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `relay.gateway-policy` | A relayed action is screened, quota-checked and submitted | ⚪ out-of-scope | none | — (proposed: on-chain) | — | The gateway is a separate service with its own test suite; driving it from the browser suite would test the deployment, not the product. The member-visible half — the self-submit fallback — is tracked under intents.sign-and-relay. |

### `041-oracle-open-challenges` — Oracle-resolved open challenges

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.open-challenge-oracle-resolution` | An open challenge resolves from its oracle condition once settled | 🟢 covered | settled | `on-chain` | `08-oracle-resolution.cy.js` (ORC-02, ORC-03) |  |

### `041-passkey-wallet-login` — Passkey wallet login

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `passkey.recover-account` | Recover the account on a new device | 🔴 absent | skipped | `account-native` | `recovery.cy.js` (RC-01, RC-04) | these tests do not execute. They are gated on `PASSKEY_FULL_STACK`, and the Cypress tasks they call (`seedUsdcForActiveSession`, `flagAddress`) are not registered in cypress.config.js — so the flag alone would not run them; the local-stack harness behind it was never built (#1271) |

### `043-safe-multisig-custody` — Safe multisig custody

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.create-vault` | Create a Safe vault and add its owners | 🟢 covered | settled | `on-chain` | `29-protect-custody.cy.js` (CV-01) |  |
| `custody.propose-and-execute` | Propose a transaction, collect approvals, execute it | 🟢 covered | settled | `on-chain` | `29-protect-custody.cy.js` (CV-02) |  |
| `custody.operate-as-vault` | Act as the vault rather than as yourself, and see which you are | 🟢 covered | flow | `on-chain` | `29-protect-custody.cy.js` (CV-03) |  |
| `custody.vault-action-sheet` | One sheet offers the four vault actions, and states why any is closed | 🟢 covered | flow | `no-chain` | `41-protect-vault-actions.cy.js` (VA-01, VA-05, VA-06) |  |
| `custody.create-vault-defaults` | A new vault defaults to a majority threshold and a starter policy, and refuses 1-of-1 with none | 🟢 covered | flow | `no-chain` | `41-protect-vault-actions.cy.js` (VA-02, VA-03, VA-04) |  |

### `049-multisig-policy-engine` — Multisig policy engine

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.policy-v1-enforced` | A vault policy refuses a transaction that breaks its rules | 🟢 covered | settled | `on-chain` | `29-protect-custody.cy.js` (CV-07) |  |

### `050-earn-lending-rewards` — Earn — lending

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `earn.deposit-to-vault` | Deposit into a lending vault and see the position | 🟢 covered | settled | `on-chain` | `31-earn-lend-stake.cy.js` (EL-01) |  |
| `earn.withdraw-from-vault` | Withdraw a lending position back to the wallet | 🟢 covered | settled | `on-chain` | `31-earn-lend-stake.cy.js` (EL-02) |  |

### `050-sponsored-paymaster` — Sponsored paymaster

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `paymaster.sponsored-userop` | Send a passkey transaction with the fee sponsored | 🔴 absent | none | — (proposed: account-native) | #1240 | the NEGATIVE half is covered (PM-01/PM-02: nothing claims a sponsorship this deployment cannot deliver). Actually sending a sponsored UserOp needs a live ERC-4337 bundler and the KMS-signed /v1/paymaster endpoint, neither of which any test tier runs — and a stub would assert that the stub was called, not that a member paid nothing |

### `052-payments-style-wager-create` — Payments-style wager create

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.create-and-escrow` | Create a wager and have the stake escrowed | 🟢 covered | settled | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-01, CRE-02, CRE-03, CRE-04, CRE-05) |  |

### `053-home-create-challenge` — Create a challenge from home

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `home.create-challenge-entry` | Start a challenge from the home screen | 🟢 covered | flow | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-11, CRE-12) |  |

### `055-collectibles-portfolio` — Collect — buy side

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `collect.browse-and-buy` | Browse collectibles and buy one | 🟢 covered | flow | `no-chain` | `37-predict-and-collect.cy.js` (CO-01, CO-03) |  |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.place-order` | Place an order on Polymarket's order book | ⚪ out-of-scope | none | — (proposed: no-chain) | — | The order book is a third-party venue with no local stand-in; the member-visible half — quoting, fee disclosure and the Polygon-only gate — is drivable and tracked as predict.builder-fee-disclosed. |

### `058-send-request-home` — Send and request from home

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `transfer.send-from-home` | Send funds to someone from the home screen | 🟢 covered | settled | `on-chain` | `33-transfers-swap-vouchers.cy.js` (TR-01) |  |

### `061-bitcoin-transactions` — Bitcoin

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bitcoin.send` | Send bitcoin, paying the network fee you confirmed | ⚪ out-of-scope | none | — (proposed: on-chain) | — | No local regtest node exists in the harness, so nothing can settle a Bitcoin send. Standing up one is the work; until then this is a named gap rather than a silent skip. |
| `bitcoin.receive-address-rotates` | Get a fresh receive address that is never reissued | 🟢 covered | flow | `account-native` | `bitcoin-receive.cy.js` (BTC-01, BTC-02) |  |

### `062-legacy-account-recovery` — Legacy account recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `recovery.import-legacy-key` | Import an old private key or word list and have it stored encrypted | 🟢 covered | settled | `no-chain` | `28-legacy-recovery.cy.js` (LKR-01, LKR-02, LKR-03, LKR-04) |  |
| `recovery.sweep-per-asset-outcomes` | Sweep a recovered account and see a per-asset result when one asset fails | 🟢 covered | settled | `on-chain` | `28-legacy-recovery-sweep.cy.js` (LKR-S1, LKR-S2, LKR-S3) |  |

### `063-cross-chain-legacy-recovery` — Cross-chain legacy recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `recovery.sweep-across-chains` | Sweep a recovered account on more than one chain | 🟢 covered | flow | `no-chain` | `28-legacy-recovery.cy.js` (LKR-05, LKR-06) |  |

### `065-liquid-delegated-staking` — Liquid delegated staking

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `earn.stake-and-delegate` | Stake into a delegated position and see it | 🟢 covered | settled | `on-chain` | `31-earn-lend-stake.cy.js` (ES-01) |  |
| `earn.unstake` | Unstake and return the position to the wallet | 🟢 covered | settled | `on-chain` | `31-earn-lend-stake.cy.js` (ES-02) |  |

### `067-bridge-pool-liquidity` — Bridge and supplied liquidity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bridge.deposit-member-is-depositor` | Bridge funds with yourself as the depositor, so an unfilled deposit refunds to you | 🟢 covered | settled | `on-chain` | `30-bridge-liquidity.cy.js` (BL-03) |  |
| `liquidity.supply-uniswap-position` | Supply a Uniswap position, minted to you and not the router | 🟢 covered | settled | `on-chain` | `30-bridge-liquidity.cy.js` (BL-01) |  |
| `liquidity.pause-stops-new-only` | A pause stops new supplies while existing positions stay withdrawable | 🟢 covered | settled | `on-chain` | `30-bridge-liquidity.cy.js` (BL-02) |  |

### `068-protect-multi-chain-policies` — Protect — policy v2

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.policy-v2-first-match` | A first-match rule array decides a proposal, and no match denies it | 🟢 covered | settled | `on-chain` | `29-protect-custody.cy.js` (CV-05) |  |
| `custody.policy-v2-adoption` | A vault consents to the v2 guard through a threshold-approved change | 🟢 covered | settled | `on-chain` | `29-protect-custody.cy.js` (CV-04) |  |

### `070-safe-receiver` — Safe receiver

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.safe-receiver` | A vault receives assets that require a callback | ⚪ out-of-scope | none | — (proposed: on-chain) | — | Spec 070 is paused with open issues and nothing is shipped; there is no surface to drive. |

### `071-multi-chain-admin-console` — Multi-chain admin console

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.configure-tier` | An operator changes a tier price and the chain reports the price every future purchase is quoted | 🟢 covered | settled | `on-chain` | `15-admin-panel.cy.js` (ADM-04) |  |
| `admin.treasury-withdrawal` | An operator withdraws accrued fees and the named recipient's balance moves by exactly that amount | 🟢 covered | settled | `on-chain` | `15-admin-panel.cy.js` (ADM-05) |  |

### `073-miniapp-platform` — Mini-app platform

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.host-submit-screens` | A mini-app transaction is screened inside the host before any rail is touched | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-05) |  |

### `083-perps-position-management` — Perps positions

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `perps.execute-order` | Place or close a perpetuals order in the app | ⚪ out-of-scope | none | — (proposed: on-chain) | — | No in-app execution ships (spec 082 FR-018); there is nothing to drive. An execution wrapper is a later spec with its own security lifecycle. |

### `085-hardware-wallet-protect` — Hardware wallets

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `hardware.add-and-reconnect` | Add a hardware account and reconnect to it later | 🟢 covered | flow | `no-chain` | `27-protect-hardware.cy.js` (HW-01, HW-02, HW-03, HW-04, HW-05) |  |
| `hardware.physical-confirmation` | Confirm a transaction on the device screen | ⚪ out-of-scope | none | — (proposed: no-chain) | — | Requires a physical device; the vendor seam is unit-tested behind connectHardware and the adapter errors are covered by the fast tier. |

### `088-instant-acting-accounts` — Instant acting accounts

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.act-immediately-after-create` | Switch to an acting account and use it immediately, with no ceremony at switch time | 🟢 covered | flow | `no-chain` | `33-account-surfaces.cy.js` (AA-01) |  |

### `098-acting-account-purchase` — Membership purchase lands on the acting account

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `purchase.acting-account` | A member operating as another account purchases membership that lands on the acting account, on every submit rail (money path: on-chain tier required) | 🔴 absent | none | — (proposed: on-chain) | #1364 |  |
| `purchase.acting-refusals` | Purchase still refuses, with the reason, when the acting account cannot be msg.sender on the membership chain | 🔴 absent | none | — (proposed: no-chain) | #1364 |  |

## Disclosure — a member consents to a cost

12 flows — 🟢 12 · 🟡 0 · 🔴 0 · ⚪ 0 · covered-but-not-proven 0

### `050-sponsored-paymaster` — Sponsored paymaster

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `paymaster.fallback-disclosed` | When sponsorship is unavailable, be told honestly that you are paying the fee | 🟢 covered | flow | `account-native` | `paymaster-disclosure.cy.js` (PM-01, PM-02) |  |

### `052-payments-style-wager-create` — Payments-style wager create

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.create-flow-validation` | Be stopped before signing when the wager form is wrong | 🟢 covered | flow | `no-chain` | `04-wager-creation-validation.cy.js` (CRE-17, CRE-18, CRE-19, CRE-20, CRE-21, CRE-22, CRE-23, CRE-24, CRE-25, CRE-26, CRE-27, CRE-28, CRE-29, CRE-30) |  |

### `056-collectibles-sell-side` — Collect — sell side

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `collect.list-for-sale` | List a collectible for sale and see the fee disclosure | 🟢 covered | flow | `no-chain` | `37-predict-and-collect.cy.js` (CO-02) |  |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.builder-fee-disclosed` | See the additive builder fee as its own line before signing an order | 🟢 covered | settled | `no-chain` | `37-predict-and-collect.cy.js` (PR-02, PR-04) |  |

### `060-platform-fee-wrapper` — Platform fees

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `fees.disclosed-before-signature` | See the live fee rate before signing, and be charged no more than that | 🟢 covered | settled | `on-chain` | `25-platform-fees.cy.js` (FEE-01, FEE-02) |  |
| `fees.zero-rate-shows-no-line` | See no fee line at all when the rate is zero | 🟢 covered | flow | `no-chain` | `28-platform-fee-disclosure.cy.js` (FEE-04, FEE-05) |  |
| `fees.admin-changes-rate` | An operator changes a service's rate and members see the new one | 🟢 covered | settled | `on-chain` | `25-platform-fees.cy.js` (FEE-03) |  |

### `061-bitcoin-transactions` — Bitcoin

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bitcoin.fee-quote-expiry` | Be refused a stale fee quote rather than signing at the wrong fee | 🟢 covered | flow | `account-native` | `bitcoin-send-fee.cy.js` (BTC-03) |  |

### `067-bridge-pool-liquidity` — Bridge and supplied liquidity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bridge.fee-consent-ceiling` | The quoted bps is a ceiling on what can be charged | 🟢 covered | settled | `on-chain` | `30-bridge-liquidity.cy.js` (BL-04) |  |

### `095-member-api-agentic-access` — Member API, private API keys and the opt-in assistant

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `assistant.opt-in` | The assistant does not exist until Settings turns it on, and stops existing when it is turned off | 🟢 covered | flow | `no-chain` | `38-assistant.cy.js` (AS-01) |  |
| `assistant.honest-unreachable` | An unreachable assistant service is named and retryable, and never answered for | 🟢 covered | flow | `no-chain` | `38-assistant.cy.js` (AS-02) |  |
| `assistant.memory-clear` | Conversation memory is device-local, counted in Settings, and clearable to nothing | 🟢 covered | settled | `no-chain` | `38-assistant.cy.js` (AS-03) |  |

## Access — gating, identity and permission

46 flows — 🟢 42 · 🟡 1 · 🔴 3 · ⚪ 0 · covered-but-not-proven 1

### `003-polymarket-only-oracle-ui` — Polymarket-only oracle UI

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `oracle.select-polymarket-resolution` | Choose Polymarket resolution when creating a wager and see the condition bound to it | 🟢 covered | settled | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-06, CRE-07) |  |

### `005-multi-recipient-encryption` — Multi-recipient encryption

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `encryption.register-key` | Register an encryption key so private wagers can be addressed to you | 🟢 covered | settled | `on-chain` | `03-encryption-chain.cy.js` (ENC-02, ENC-03) |  |
| `encryption.private-wager-roundtrip` | Create a private wager and have every intended recipient decrypt it | 🟢 covered | flow | `on-chain` | `16-privacy-encryption.cy.js` (PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, PRV-07) |  |

### `007-compliance-gating` — Compliance gating

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `compliance.accept-terms-before-entry` | Read and accept the versioned terms before reaching the app | 🟢 covered | flow | `no-chain` | `34-member-surfaces.cy.js` (CG-01, CG-02) |  |
| `compliance.sanctioned-address-refused` | A screened address is refused before any transaction is offered | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (CM-01) |  |
| `compliance.frozen-account-blocked` | A frozen account cannot create a wager, and unfreezing restores it | 🟢 covered | settled | `on-chain` | `18-frozen-accounts.cy.js` (FRZ-01, FRZ-02) |  |
| `compliance.paused-protocol-blocked` | A paused protocol refuses new wagers, and unpausing restores them | 🟢 covered | settled | `on-chain` | `19-paused-protocol.cy.js` (PAU-01, PAU-02) |  |
| `compliance.passkey-account-parity` | A passkey account meets the same compliance gates as a classic wallet | 🟢 covered | settled | `on-chain` | `compliance.cy.js` (CP-01); `38-passkey-compliance.cy.js` (CP-02, CP-03) |  |

### `008-runtime-chain-consistency` — Runtime chain consistency

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `network.wrong-chain-guard` | Be told, and blocked, when the wallet is on a different chain than the surface | 🟢 covered | flow | `no-chain` | `21-network-errors.cy.js` (NET-01, NET-02, NET-03) |  |

### `021-address-book` — Address book

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `addressbook.save-and-use-contact` | Save a contact and address a wager or transfer to it | 🟢 covered | settled | `no-chain` | `34-member-surfaces.cy.js` (MS-01) |  |

### `022-membership-purchase-progress` — Membership purchase progress

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.expired-blocks-participation` | An expired membership blocks wager creation until it is renewed | 🟢 covered | settled | `on-chain` | `20-expired-membership.cy.js` (EXP-01, EXP-02) |  |

### `032-encrypted-data-sync` — Encrypted data sync

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `backup.encrypted-sync-roundtrip` | Back up local data encrypted and restore it on another device | 🟢 covered | settled | `on-chain` | `35-navigation-and-lookup.cy.js` (BK-01, BK-02); `37-backup-roundtrip.cy.js` (BKC-01, BKC-02) |  |

### `037-unified-pool-challenge-lookup` — Unified pool and challenge lookup

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.lookup-by-code` | Find a pool or challenge from a code someone sent you | 🟢 covered | flow | `no-chain` | `35-navigation-and-lookup.cy.js` (LK-01) |  |

### `041-passkey-wallet-login` — Passkey wallet login

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `passkey.create-account` | Create an account with a passkey and no seed phrase | 🟢 covered | settled | `account-native` | `onboarding-journey.cy.js` (PK-02) |  |
| `passkey.return-and-sign-in` | Come back on the same device and sign in | 🟢 covered | settled | `account-native` | `returning-user.cy.js` (RU-01, RU-02) |  |
| `passkey.unified-login` | Reach the same account whether you arrive by passkey or by wallet | 🟢 covered | flow | `account-native` | `unified-login.cy.js` (UL-03, UL-05) |  |
| `passkey.controllers` | Add and remove the controllers that may act for the account | 🔴 absent | skipped | `account-native` | `controllers.cy.js` (CT-01, CT-02, CT-03) | these tests do not execute. They are gated on `PASSKEY_FULL_STACK`, and the Cypress tasks they call (`seedUsdcForActiveSession`, `flagAddress`) are not registered in cypress.config.js — so the flag alone would not run them; the local-stack harness behind it was never built (#1271) |
| `passkey.app-lock` | Lock the screen after idle or on leaving, and unlock with a passkey | 🔴 absent | none | — (proposed: no-chain) | #1364 | no Cypress spec exists yet. The flow is validatable without a chain (WebAuthn virtual authenticator, no transaction), so it belongs in the no-chain tier under the admission rule. Unit coverage: frontend/src/test/applock/ (31 assertions across the store, overlay and Settings card). |

### `042-clearpath-multi-network` — ClearPath across networks

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.clearpath-network-switch` | Use ClearPath on a second network | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-07) |  |

### `045-unified-connect-recovery` — Unified connect and recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `connect.choose-a-way-in` | Choose between wallet, passkey and recovery from one entry point | 🟢 covered | flow | `no-chain` | `01-wallet-connection.cy.js` (WAL-01, WAL-02, WAL-03, WAL-04) |  |
| `connect.disconnect-and-switch` | Disconnect, and switch between accounts | 🟢 covered | flow | `no-chain` | `01-wallet-connection.cy.js` (WAL-05, WAL-06, WAL-07, WAL-08, WAL-09, WAL-10, WAL-11) |  |
| `connect.first-run-onboarding` | Arrive with nothing set up and be walked to a way in | 🟢 covered | smoke | `no-chain` | `17-onboarding.cy.js` (ONB-01, ONB-02, ONB-03) |  |

### `054-callsign-registry` — Callsigns

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `callsign.commit-reveal-register` | Register a %callsign through commit and reveal | 🟢 covered | settled | `on-chain` | `34-callsign-registration.cy.js` (CR-01) |  |
| `callsign.resolve-in-address-entry` | Address a transfer to someone by their callsign | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (CS-02) |  |
| `callsign.gated-below-gold` | Be told why registration is unavailable below Gold tier | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (CS-01) |  |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.hidden-off-polygon` | See the Predict tab hidden on a chain Polymarket does not serve | 🟢 covered | settled | `no-chain` | `37-predict-and-collect.cy.js` (PR-03) |  |

### `061-bitcoin-transactions` — Bitcoin

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bitcoin.network-card-activates` | Open the Bitcoin wallet surface from its network card without touching the EVM chain | 🔴 absent | none | — (proposed: no-chain) | #1364 |  |

### `066-staking-admin-controls` — Staking admin controls

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.staking-controls` | An operator pauses or retires a staking route | 🟢 covered | settled | `on-chain` | `31-earn-lend-stake.cy.js` (ES-03) |  |

### `069-network-endpoints-user-panel` — Network endpoints

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `endpoints.save-custom-rpc` | Save your own RPC endpoint and have reads use it | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (EP-01) |  |
| `endpoints.wrong-chain-refused` | Be refused an endpoint that answers with a different chain id | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (EP-02) |  |
| `endpoints.credentials-redacted` | Never see your endpoint credential rendered back to you | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (EP-03) |  |

### `071-multi-chain-admin-console` — Multi-chain admin console

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.estate-reads-three-state` | An operator reads the estate and sees not-deployed and unreadable distinguished from zero | 🟢 covered | settled | `no-chain` | `32-admin-console.cy.js` (AD-04) |  |
| `admin.single-chain-write` | An operator writes to one named chain with authority read from that chain | 🟢 covered | settled | `on-chain` | `35-admin-single-chain-write.cy.js` (AD-06) |  |
| `admin.grant-revoke-membership` | An operator grants a membership tier to a user address and revokes it, judged on-chain | 🟢 covered | settled | `on-chain` | `15-admin-panel.cy.js` (ADM-03) |  |
| `admin.grant-revoke-operator-role` | An operator grants an admin role to an address, the contract confirms it, and a revoke removes it | 🟢 covered | settled | `on-chain` | `35-admin-single-chain-write.cy.js` (AD-07) |  |

### `072-white-label-tenants` — White-label tenants

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `tenant.brand-resolves-from-manifest` | A tenant build shows its own identity and no other tenant's | 🟢 covered | settled | `no-chain` | `31-identity-access.cy.js` (TN-01) |  |

### `073-miniapp-platform` — Mini-app platform

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.launch-verified-package` | Launch a mini-app whose bytes are verified against the chain | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-01) |  |
| `miniapp.launchable-not-status` | A live app whose update is in review still launches | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-02) |  |
| `miniapp.curator-approve-content-committed` | A curator approval is refused when the package changed under it | 🟢 covered | settled | `on-chain` | `32-miniapps.cy.js` (MA-03) |  |

### `084-message-signing-verify` — Message signing and Verify

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `verify.three-verdicts` | Verify a signature and get valid, invalid, or unverifiable — never a forged-looking result from an RPC timeout | 🟢 covered | settled | `no-chain` | `30-verify-message.cy.js` (VF-01, VF-02) |  |
| `verify.refused-while-operating-as-vault` | Be refused message signing while acting as a vault | 🟢 covered | flow | `no-chain` | `30-verify-message.cy.js` (VF-03) |  |

### `093-admin-mini-apps` — Admin mini-apps

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.control-room-gating` | An operator sees granted, denied, or could-not-verify — never a silent denial | 🟢 covered | settled | `no-chain` | `32-admin-console.cy.js` (AD-01, AD-02, AD-03); `15-admin-panel.cy.js` (ADM-01, ADM-02) |  |
| `admin.maintenance-permissionless` | Any entrant reaches Maintenance without elevated status | 🟢 covered | settled | `no-chain` | `32-admin-console.cy.js` (AD-05) |  |

### `095-member-api-agentic-access` — Member API, private API keys and the opt-in assistant

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `api-access.create-key` | A member-signed grant is revealed once, persisted nowhere, and leaves only metadata | 🟢 covered | settled | `no-chain` | `39-api-access.cy.js` (API-01, API-05) |  |
| `api-access.revoke-key` | A signed revocation is registered without overstating what registration means | 🟢 covered | flow | `no-chain` | `39-api-access.cy.js` (API-02, API-03) |  |
| `api-access.console` | The api-access developer console: OpenAPI explorer, token introspection and MCP setup | 🟡 partial | smoke | `no-chain` | `39-api-access.cy.js` (API-04) | Only the HOST card is exercised — the generated MCP snippet carries a placeholder rather than a credential, and the card links to the packaged console. The console itself is a spec-073 registry package, and no catalogue serves it in the no-chain tier (the registry read is stubbed there, and the package bytes are not published). Its OpenAPI explorer, /v1/member/me introspection and try-it panel need the on-chain tier, where `npm run setup:e2e` publishes packages and the local registry can list them. |

## Information — read-only surfaces

38 flows — 🟢 38 · 🟡 0 · 🔴 0 · ⚪ 0 · covered-but-not-proven 12

### `005-multi-recipient-encryption` — Multi-recipient encryption

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `encryption.key-ui` | See encryption state and prompts before any chain write | 🟢 covered | smoke | `no-chain` | `03-encryption-ui.cy.js` (ENC-01, ENC-04, ENC-05, ENC-06, ENC-07) |  |

### `009-fix-qr-share` — Share a wager by QR

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `share.wager-link-and-qr` | Share a wager by link or QR and have the recipient land on it | 🟢 covered | flow | `no-chain` | `12-sharing-ui.cy.js` (SHR-01, SHR-02, SHR-03, SHR-04) |  |

### `010-footer-policy-fixes` — Policy documents

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `legal.read-versioned-policies` | Open terms, risk and privacy from the footer before connecting | 🟢 covered | settled | `no-chain` | `34-member-surfaces.cy.js` (MS-05) |  |

### `011-wallet-address-qr` — Wallet address QR

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `receive.show-address-qr` | Show your address as a QR for someone to send to | 🟢 covered | smoke | `no-chain` | `12-sharing-ui.cy.js` (SHR-05, SHR-06, SHR-07, SHR-08) |  |

### `012-wager-notifications` — Wager notifications

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.wager-state-change` | Be notified when a wager you are in changes state | 🟢 covered | flow | `on-chain` | `36-wager-notifications.cy.js` (NOT-01, NOT-02) |  |

### `013-polymarket-search-filter` — Polymarket search and filter

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.search-markets` | Search and filter Polymarket markets when choosing a condition | 🟢 covered | settled | `no-chain` | `37-predict-and-collect.cy.js` (PR-01) |  |

### `014-quick-action-dashboard` — Quick-action dashboard

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `home.quick-actions` | Reach the common actions from the home screen | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-01, DSH-02, DSH-03, DSH-04) |  |

### `016-wager-tax-report` — Wager tax report

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `reports.export-wager-history` | Export a settled-wager report for tax purposes | 🟢 covered | flow | `no-chain` | `34-member-surfaces.cy.js` (MS-02) |  |

### `017-wager-grid-redesign` — Wager grid redesign

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.browse-grid` | Browse open and participating wagers | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-05, DSH-06, DSH-07) |  |

### `018-wager-views-feedback` — Wager view feedback

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.empty-and-loading-states` | See honest empty and loading states rather than a blank grid | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-08, DSH-09) |  |

### `019-wager-auto-views` — Automatic wager views

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.auto-view-selection` | Land on the view that matches what you have | 🟢 covered | smoke | `no-chain` | `23-home-modes.cy.js` (HMM-01, HMM-02, HMM-03, HMM-04, HMM-05) |  |

### `020-account-stats-dashboard` — Account stats

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.see-stats` | See your wager record and balances | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-10, DSH-11, DSH-12) |  |

### `023-oracle-graph-gating` — Oracle graph gating

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `oracle.graph-unavailable-degrades` | See an honest degraded state when the oracle index is unreachable | 🟢 covered | flow | `no-chain` | `36-activity-and-oracle-gating.cy.js` (OG-01) |  |

### `031-platform-notifications` — Platform notifications

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.platform-feed` | See platform notifications and clear them | 🟢 covered | flow | `no-chain` | `34-member-surfaces.cy.js` (MS-03) |  |

### `038-ux-consistency` — UX consistency

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `ui.consistent-controls` | Find the same control in the same place across surfaces | 🟢 covered | smoke | `no-chain` | `22-accessibility.cy.js` (A11Y-01, A11Y-02, A11Y-03) |  |

### `039-wager-info-tooltips` — Wager info tooltips

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.explanatory-tooltips` | Read what a wager field means before committing to it | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-13, DSH-14) |  |

### `040-my-wagers-refinements` — My Wagers refinements

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.my-wagers-tabs` | Separate what you created from what you joined | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-15, DSH-16, DSH-17, DSH-18) |  |

### `044-connected-account-portfolio` — Connected account portfolio

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `portfolio.see-holdings` | See what the connected account holds across supported assets | 🟢 covered | settled | `no-chain` | `33-account-surfaces.cy.js` (AC-02, AC-03) |  |

### `047-mask-sensitive-values` — Mask sensitive values

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `privacy.mask-balances` | Hide balances on screen when someone is looking over your shoulder | 🟢 covered | settled | `no-chain` | `33-account-surfaces.cy.js` (AC-05) |  |

### `051-unified-activity-ledger` — Activity ledger

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `activity.see-unified-history` | See one history across wagers, transfers and membership | 🟢 covered | flow | `no-chain` | `33-account-surfaces.cy.js` (AC-04) |  |

### `059-notification-profiles` — Notification profiles

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.choose-profile` | Choose how much you are notified | 🟢 covered | flow | `no-chain` | `34-member-surfaces.cy.js` (MS-04) |  |

### `064-universal-asset-selector` — Universal asset selector

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `assets.pick-any-supported-asset` | Pick any supported asset from one selector | 🟢 covered | flow | `no-chain` | `35-navigation-and-lookup.cy.js` (AS-01) |  |

### `068-protect-multi-chain-policies` — Protect — policy v2

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.multi-chain-vault-list` | See vaults across chains, with a failed chain named rather than shown as empty | 🟢 covered | flow | `on-chain` | `29-protect-custody.cy.js` (CV-06) |  |

### `074-unified-my-account` — My Account

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.unified-panel` | Reach preferences, membership and network from one account panel | 🟢 covered | settled | `no-chain` | `33-account-surfaces.cy.js` (AC-01) |  |

### `077-miniapp-store-redesign` — Mini-app store

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.browse-catalog` | Browse the app catalogue and pin an app to quick access | 🟢 covered | settled | `no-chain` | `29-miniapp-catalog.cy.js` (MC-01, MC-02, MC-03) |  |

### `078-my-wagers-single-table-view` — My Wagers single table

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.single-table-view` | See every wager you are in as one table | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-05, DSH-06) |  |

### `081-nav-drawer-density` — Nav drawer density

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `nav.drawer-sections-and-density` | Fold nav sections and choose a compact density that survives a reload | 🟢 covered | flow | `no-chain` | `35-navigation-and-lookup.cy.js` (NV-01, NV-02) |  |

### `082-perps-trade-view` — Perps market data

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `perps.browse-venues` | Compare perpetuals pairs across venues | 🟢 covered | flow | `no-chain` | `24-perps.cy.js` (PERPS-01, PERPS-02, PERPS-03, PERPS-04, PERPS-05) |  |
| `perps.degraded-venue-named` | A degraded venue is named and its pairs omitted, never shown as zeros | 🟢 covered | flow | `no-chain` | `24-perps.cy.js` (PERPS-01, PERPS-06) |  |
| `trade.wrap-view` | Wrap is a Trade view beside Swap and Perps, with Swap still the default | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (TRADE-WRAP-01, TRADE-WRAP-02) |  |
| `trade.wrap-legacy-redirect` | The old Transfer wrap URL redirects into the Trade wrap view | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (TRADE-WRAP-03, TRADE-WRAP-04) |  |

### `083-perps-position-management` — Perps positions

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `perps.read-positions` | Read your open positions without being offered a way to trade them here | 🟢 covered | flow | `no-chain` | `25-perps-management.cy.js` |  |

### `086-account-cards` — Account cards

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.cards` | See your accounts as cards and switch between them | 🟢 covered | smoke | `no-chain` | `26-trade-account.cy.js` |  |
| `account.add-chooser` | Open the "+" chooser and see the three ways to add an account | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (ACC-ADD-01) |  |
| `account.add-hardware` | "Add a hardware account" deep-links to Protect > Off chain with the card open | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (ACC-ADD-02) |  |
| `account.add-vault` | "Add a vault" deep-links to Protect > On chain | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (ACC-ADD-03) |  |
| `account.add-legacy-recovery` | "Recover a legacy account" deep-links to Recovery's legacy import | 🟢 covered | flow | `no-chain` | `40-account-add-wrap-move.cy.js` (ACC-ADD-04) |  |

### `092-multi-chain-activity` — Multi-chain activity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `activity.multi-chain-history` | See activity across chains, with an unreadable chain named rather than empty | 🟢 covered | flow | `no-chain` | `36-activity-and-oracle-gating.cy.js` (MC-01, MC-02) |  |

## No member-facing flow

Listed so the gate can tell "correctly omitted" from "forgotten".

| Spec | Why there is nothing to drive |
|---|---|
| `002-e2e-encryption-lifecycle` — E2E encryption lifecycle | A test-coverage spec for the encryption feature; its flows are recorded under 005-multi-recipient-encryption. |
| `006-local-dev-environment` — Local development environment | Developer tooling; there is no member surface to drive. |
| `015-mordor-network-deployment` — Mordor network deployment | A deployment target; the member-facing surface is network selection, recorded under 069-network-endpoints-user-panel. |
| `017-subgraph-v2-wager-transfers` — Subgraph v2 wager transfers | Indexing infrastructure; the member-facing surface is the wager lists it feeds, recorded under 078. |
| `025-upgradeable-registry` — Upgradeable wager registry | Proxy upgrade mechanics; the member-facing surface is every wager flow that runs against the proxy, and is recorded there. Storage layout is gated by check:storage-layout. |
| `027-upgradeable-membership` — Upgradeable membership manager | Proxy upgrade mechanics; membership's member-facing flows are recorded under 022 and 071. |
| `046-contract-audit-coverage` — Contract audit coverage | Contract test coverage policy; enforced by the Solidity suite and the coverage threshold gate. |
| `048-ethereum-mainnet-support` — Ethereum mainnet support | A network configuration; the member-facing surface is network selection and per-chain reads, recorded under 069 and 071. |
| `075-monorepo-workspaces` — Monorepo workspaces | Build and dependency tooling; no member surface. Gated by check:deps and the byte-diff gates. |
| `076-monorepo-semantic-versioning` — Semantic versioning | Release tooling; no member surface. Gated by the release tooling tests. |
| `079-hardhat-3-migration` — Hardhat 3 migration | Contract toolchain migration; no member surface. |
| `080-deterministic-addresses` — Deterministic addresses | Deployment mechanics; the member-facing effect is that addresses match the recorded deployments, gated by the deploy scripts. |
| `087-infrastructure-as-code` — Infrastructure as code | Cloud provisioning; no member surface. Gated by check:iac and the Terraform plan. |
| `089-finops-dashboard` — FinOps dashboard | Internal revenue and cost dashboards; no member surface. Gated by check:finops. |
| `090-chippr-brand-alignment` — Chippr brand alignment | Design tokens; member-visible but with no journey to drive. Gated by the four brand tests in frontend/src/test/brand/. |
| `091-neutral-token-consolidation` — Neutral token consolidation | Design tokens; gated by noHardcodedColors and noUndefinedTokens. |
| `094-e2e-coverage-expansion` — E2E coverage expansion | This feature: the matrix, the tiering policy and the suite's own gates. Its subject is the coverage of every other row. |
| `096-x402-agentic-payments` — x402 pay-per-request access to the member API | An agent-facing HTTP rail with no member surface: an unauthenticated caller is answered 402 with a price, pays with an X-PAYMENT header, and is served as the payer. No component, route or member journey changes, and a member holding a capability token never enters the path. Its gate is the gateway vitest suite (services/relay-gateway/test/x402.test.js) plus the spec-095 suites passing unchanged with the rail enabled, and node:test coverage of the MCP server's 402 surfacing and payment passthrough. |
| `097-workstation-secrets-observability` — Workstation secrets and local observability | Operator tooling with no member surface: credentials move off a local .env into Secret Manager and are delivered per least-privilege profile by a wrapper, and the Prometheus and Grafana stack is a read-only viewing surface bound to loopback. Nothing here is reachable from the app, and the workstation identity is declared Terraform with no service-account key file. Gated by the scripts/secrets vitest suites (including the registry/tfvars parity test, which fails on drift because a missing grant surfaces later as PERMISSION_DENIED), check:env-hygiene, and the Terraform plan. |
| `099-network-status-miniapp` — Network status mini-app | Spec landed in release 1.14.0; the mini-app package has no member surface yet. Flows are owed when the package ships (#1364). |
| `100-passkey-solana` — Passkey-native Solana | Spec + plan landed in release 1.14.0; no member surface exists yet. Implementation follows the constitution-checked plan (#1364). |
| `101-passkey-zcash` — Passkey-native Zcash | Spec + plan landed in release 1.14.0; no member surface exists yet. Implementation follows the constitution-checked plan (#1364). |

## Covered but not proven

Passing tests that do not establish the outcome. Each needs its assertions deepened, not
another test added beside it.

| Flow | Spec | Depth | Evidence |
|---|---|---|---|
| `encryption.key-ui` | `005-multi-recipient-encryption` | smoke | `03-encryption-ui.cy.js` (ENC-01, ENC-04, ENC-05, ENC-06, ENC-07) |
| `receive.show-address-qr` | `011-wallet-address-qr` | smoke | `12-sharing-ui.cy.js` (SHR-05, SHR-06, SHR-07, SHR-08) |
| `home.quick-actions` | `014-quick-action-dashboard` | smoke | `13-dashboard.cy.js` (DSH-01, DSH-02, DSH-03, DSH-04) |
| `wagers.browse-grid` | `017-wager-grid-redesign` | smoke | `13-dashboard.cy.js` (DSH-05, DSH-06, DSH-07) |
| `wagers.empty-and-loading-states` | `018-wager-views-feedback` | smoke | `13-dashboard.cy.js` (DSH-08, DSH-09) |
| `wagers.auto-view-selection` | `019-wager-auto-views` | smoke | `23-home-modes.cy.js` (HMM-01, HMM-02, HMM-03, HMM-04, HMM-05) |
| `account.see-stats` | `020-account-stats-dashboard` | smoke | `13-dashboard.cy.js` (DSH-10, DSH-11, DSH-12) |
| `ui.consistent-controls` | `038-ux-consistency` | smoke | `22-accessibility.cy.js` (A11Y-01, A11Y-02, A11Y-03) |
| `wagers.explanatory-tooltips` | `039-wager-info-tooltips` | smoke | `13-dashboard.cy.js` (DSH-13, DSH-14) |
| `wagers.my-wagers-tabs` | `040-my-wagers-refinements` | smoke | `13-dashboard.cy.js` (DSH-15, DSH-16, DSH-17, DSH-18) |
| `connect.first-run-onboarding` | `045-unified-connect-recovery` | smoke | `17-onboarding.cy.js` (ONB-01, ONB-02, ONB-03) |
| `wagers.single-table-view` | `078-my-wagers-single-table-view` | smoke | `13-dashboard.cy.js` (DSH-05, DSH-06) |
| `account.cards` | `086-account-cards` | smoke | `26-trade-account.cy.js` |

