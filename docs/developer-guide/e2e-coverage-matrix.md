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
| Spec directories | 96 |
| With a member-facing flow | 79 |
| Member-facing flows | 130 |
| 🟢 covered | 46 |
| 🟡 partial | 7 |
| 🔴 absent | 71 |
| ⚪ out of scope | 6 |
| **Covered but not proven** (status `covered`, depth below `flow`) | **13** |

The last row is the honest read of the suite: those flows have passing tests that do not
establish the outcome. They are listed in full at the end of this document.

## Custody — member funds are escrowed, moved, bridged, swept or sent

51 flows — 🟢 15 · 🟡 5 · 🔴 25 · ⚪ 6 · covered-but-not-proven 0

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
| `wagers.declare-draw` | An arbitrator declares a draw and both stakes are returned | 🟡 partial | smoke | `on-chain` | `07-manual-resolution.cy.js` (RES-13, RES-14) | the draw branch sits behind a precondition guard that ends in an unconditional truth, so the refunded balances are never read back |

### `022-membership-purchase-progress` — Membership purchase progress

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.purchase-progress` | Watch a membership purchase progress through its steps | 🟢 covered | flow | `on-chain` | `02-membership.cy.js` (MEM-04, MEM-05, MEM-06) |  |

### `024-open-challenge-wagers` — Open challenge wagers

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.create-open-challenge` | Post a wager anyone may accept | 🟢 covered | settled | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-09, CRE-10) |  |
| `wagers.accept-open-challenge` | Accept someone else's open challenge | 🟡 partial | smoke | `on-chain` | `05-wager-acceptance.cy.js` (ACC-08, ACC-09) | the acceptance branch is guarded by a precondition that can be absent and ends in an unconditional truth, so the stake transfer is never read back |

### `026-membership-vouchers` — Membership vouchers

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.redeem-voucher` | Redeem a voucher for membership without paying | 🔴 absent | none | — (proposed: on-chain) | #1240 |  |

### `028-token-mint` — Token Mint mini-app

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.token-mint-deploy` | Mint a token through the Token Mint mini-app | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |

### `030-clearpath-standard-daos` — ClearPath mini-app

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.clearpath-create-dao` | Create a standard DAO through ClearPath | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |

### `033-network-aware-swap` — Network-aware swap

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `trade.swap-quote-and-execute` | Swap one asset for another on the active network | 🔴 absent | none | — (proposed: on-chain) | #1240 |  |

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
| `intents.sign-and-relay` | Authorize an action by signature and have a relayer submit it | 🟡 partial | smoke | `on-chain` | `04-wager-creation-tx.cy.js` (CRE-13) | no test drives the relayed path end to end, and none exercises the self-submit fallback when the relayer is unavailable — the never-stranded rule is unproven |

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
| `passkey.recover-account` | Recover the account on a new device | 🟡 partial | flow | `account-native` | `recovery.cy.js` (RC-01, RC-04) | only two of the recovery paths are driven; the guardian and export routes are not |

### `043-safe-multisig-custody` — Safe multisig custody

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.create-vault` | Create a Safe vault and add its owners | 🔴 absent | none | — (proposed: on-chain) | #1235 |  |
| `custody.propose-and-execute` | Propose a transaction, collect approvals, execute it | 🔴 absent | none | — (proposed: on-chain) | #1235 |  |
| `custody.operate-as-vault` | Act as the vault rather than as yourself, and see which you are | 🔴 absent | none | — (proposed: no-chain) | #1235 |  |

### `049-multisig-policy-engine` — Multisig policy engine

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.policy-v1-enforced` | A vault policy refuses a transaction that breaks its rules | 🔴 absent | none | — (proposed: on-chain) | #1235 |  |

### `050-earn-lending-rewards` — Earn — lending

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `earn.deposit-to-vault` | Deposit into a lending vault and see the position | 🔴 absent | none | — (proposed: on-chain) | #1237 |  |
| `earn.withdraw-from-vault` | Withdraw a lending position back to the wallet | 🔴 absent | none | — (proposed: on-chain) | #1237 |  |

### `050-sponsored-paymaster` — Sponsored paymaster

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `paymaster.sponsored-userop` | Send a passkey transaction with the fee sponsored | 🔴 absent | none | — (proposed: account-native) | #1240 |  |

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
| `collect.browse-and-buy` | Browse collectibles and buy one | 🟡 partial | none | `no-chain` | #1239 | nothing drives the buy side at any tier; the OpenSea order itself is out of scope but the disclosure and confirm path is drivable |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.place-order` | Place an order on Polymarket's order book | ⚪ out-of-scope | none | — (proposed: no-chain) | — | The order book is a third-party venue with no local stand-in; the member-visible half — quoting, fee disclosure and the Polygon-only gate — is drivable and tracked as predict.builder-fee-disclosed. |

### `058-send-request-home` — Send and request from home

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `transfer.send-from-home` | Send funds to someone from the home screen | 🔴 absent | none | — (proposed: on-chain) | #1240 |  |

### `061-bitcoin-transactions` — Bitcoin

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bitcoin.send` | Send bitcoin, paying the network fee you confirmed | ⚪ out-of-scope | none | — (proposed: on-chain) | — | No local regtest node exists in the harness, so nothing can settle a Bitcoin send. Standing up one is the work; until then this is a named gap rather than a silent skip. |
| `bitcoin.receive-address-rotates` | Get a fresh receive address that is never reissued | 🔴 absent | none | — (proposed: no-chain) | #1243 |  |

### `062-legacy-account-recovery` — Legacy account recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `recovery.import-legacy-key` | Import an old private key or word list and have it stored encrypted | 🔴 absent | none | — (proposed: no-chain) | #1234 |  |
| `recovery.sweep-per-asset-outcomes` | Sweep a recovered account and see a per-asset result when one asset fails | 🔴 absent | none | — (proposed: on-chain) | #1234 |  |

### `063-cross-chain-legacy-recovery` — Cross-chain legacy recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `recovery.sweep-across-chains` | Sweep a recovered account on more than one chain | 🔴 absent | none | — (proposed: on-chain) | #1234 |  |

### `065-liquid-delegated-staking` — Liquid delegated staking

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `earn.stake-and-delegate` | Stake into a delegated position and see it | 🔴 absent | none | — (proposed: on-chain) | #1237 |  |
| `earn.unstake` | Unstake and return the position to the wallet | 🔴 absent | none | — (proposed: on-chain) | #1237 |  |

### `067-bridge-pool-liquidity` — Bridge and supplied liquidity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bridge.deposit-member-is-depositor` | Bridge funds with yourself as the depositor, so an unfilled deposit refunds to you | 🔴 absent | none | — (proposed: on-chain) | #1236 |  |
| `liquidity.supply-uniswap-position` | Supply a Uniswap position, minted to you and not the router | 🔴 absent | none | — (proposed: on-chain) | #1236 |  |
| `liquidity.pause-stops-new-only` | A pause stops new supplies while existing positions stay withdrawable | 🔴 absent | none | — (proposed: on-chain) | #1236 |  |

### `068-protect-multi-chain-policies` — Protect — policy v2

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.policy-v2-first-match` | A first-match rule array decides a proposal, and no match denies it | 🔴 absent | none | — (proposed: on-chain) | #1235 |  |
| `custody.policy-v2-adoption` | A vault consents to the v2 guard through a threshold-approved change | 🔴 absent | none | — (proposed: on-chain) | #1235 |  |

### `070-safe-receiver` — Safe receiver

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.safe-receiver` | A vault receives assets that require a callback | ⚪ out-of-scope | none | — (proposed: on-chain) | — | Spec 070 is paused with open issues and nothing is shipped; there is no surface to drive. |

### `073-miniapp-platform` — Mini-app platform

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.host-submit-screens` | A mini-app transaction is screened inside the host before any rail is touched | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |

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
| `account.act-immediately-after-create` | Act on a newly created account without waiting for a deploy | 🔴 absent | none | — (proposed: account-native) | #1240 |  |

## Disclosure — a member consents to a cost

9 flows — 🟢 1 · 🟡 0 · 🔴 8 · ⚪ 0 · covered-but-not-proven 0

### `050-sponsored-paymaster` — Sponsored paymaster

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `paymaster.fallback-disclosed` | When sponsorship is unavailable, be told honestly that you are paying the fee | 🔴 absent | none | — (proposed: account-native) | #1240 |  |

### `052-payments-style-wager-create` — Payments-style wager create

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.create-flow-validation` | Be stopped before signing when the wager form is wrong | 🟢 covered | flow | `no-chain` | `04-wager-creation-validation.cy.js` (CRE-17, CRE-18, CRE-19, CRE-20, CRE-21, CRE-22, CRE-23, CRE-24, CRE-25, CRE-26, CRE-27, CRE-28, CRE-29, CRE-30) |  |

### `056-collectibles-sell-side` — Collect — sell side

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `collect.list-for-sale` | List a collectible for sale and see the fee disclosure | 🔴 absent | none | — (proposed: no-chain) | #1239 |  |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.builder-fee-disclosed` | See the additive builder fee as its own line before signing an order | 🔴 absent | none | — (proposed: no-chain) | #1239 |  |

### `060-platform-fee-wrapper` — Platform fees

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `fees.disclosed-before-signature` | See the live fee rate before signing, and be charged no more than that | 🔴 absent | none | — (proposed: on-chain) | #1233 |  |
| `fees.zero-rate-shows-no-line` | See no fee line at all when the rate is zero | 🔴 absent | none | — (proposed: no-chain) | #1233 |  |
| `fees.admin-changes-rate` | An operator changes a service's rate and members see the new one | 🔴 absent | none | — (proposed: on-chain) | #1233 |  |

### `061-bitcoin-transactions` — Bitcoin

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bitcoin.fee-quote-expiry` | Be refused a stale fee quote rather than signing at the wrong fee | 🔴 absent | none | — (proposed: no-chain) | #1243 |  |

### `067-bridge-pool-liquidity` — Bridge and supplied liquidity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `bridge.fee-consent-ceiling` | The quoted bps is a ceiling on what can be charged | 🔴 absent | none | — (proposed: on-chain) | #1236 |  |

## Access — gating, identity and permission

38 flows — 🟢 15 · 🟡 1 · 🔴 22 · ⚪ 0 · covered-but-not-proven 1

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
| `compliance.accept-terms-before-entry` | Read and accept the versioned terms before reaching the app | 🟢 covered | flow | `account-native` | `compliance.cy.js` (CP-01, CP-02, CP-03) |  |
| `compliance.sanctioned-address-refused` | A screened address is refused before any transaction is offered | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |
| `compliance.frozen-account-blocked` | A frozen account cannot create a wager, and unfreezing restores it | 🟢 covered | settled | `on-chain` | `18-frozen-accounts.cy.js` (FRZ-01, FRZ-02) |  |
| `compliance.paused-protocol-blocked` | A paused protocol refuses new wagers, and unpausing restores them | 🟢 covered | settled | `on-chain` | `19-paused-protocol.cy.js` (PAU-01, PAU-02) |  |

### `008-runtime-chain-consistency` — Runtime chain consistency

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `network.wrong-chain-guard` | Be told, and blocked, when the wallet is on a different chain than the surface | 🟢 covered | flow | `no-chain` | `21-network-errors.cy.js` (NET-01, NET-02, NET-03) |  |

### `021-address-book` — Address book

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `addressbook.save-and-use-contact` | Save a contact and address a wager or transfer to it | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `022-membership-purchase-progress` — Membership purchase progress

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `membership.expired-blocks-participation` | An expired membership blocks wager creation until it is renewed | 🟢 covered | settled | `on-chain` | `20-expired-membership.cy.js` (EXP-01, EXP-02) |  |

### `032-encrypted-data-sync` — Encrypted data sync

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `backup.encrypted-sync-roundtrip` | Back up local data encrypted and restore it on another device | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `037-unified-pool-challenge-lookup` — Unified pool and challenge lookup

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.lookup-by-code` | Find a pool or challenge from a code someone sent you | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `041-passkey-wallet-login` — Passkey wallet login

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `passkey.create-account` | Create an account with a passkey and no seed phrase | 🟢 covered | flow | `account-native` | `onboarding-journey.cy.js` (PK-01, PK-02, PK-03) |  |
| `passkey.return-and-sign-in` | Come back on the same device and sign in | 🟢 covered | flow | `account-native` | `returning-user.cy.js` (RU-01, RU-02) |  |
| `passkey.unified-login` | Reach the same account whether you arrive by passkey or by wallet | 🟢 covered | flow | `account-native` | `unified-login.cy.js` (UL-01, UL-02, UL-03, UL-04) |  |
| `passkey.controllers` | Add and remove the controllers that may act for the account | 🟢 covered | flow | `account-native` | `controllers.cy.js` (CT-01, CT-02, CT-03) |  |

### `042-clearpath-multi-network` — ClearPath across networks

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.clearpath-network-switch` | Use ClearPath on a second network | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |

### `045-unified-connect-recovery` — Unified connect and recovery

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `connect.choose-a-way-in` | Choose between wallet, passkey and recovery from one entry point | 🟢 covered | flow | `no-chain` | `01-wallet-connection.cy.js` (WAL-01, WAL-02, WAL-03, WAL-04) |  |
| `connect.disconnect-and-switch` | Disconnect, and switch between accounts | 🟢 covered | flow | `no-chain` | `01-wallet-connection.cy.js` (WAL-05, WAL-06, WAL-07, WAL-08, WAL-09, WAL-10, WAL-11) |  |
| `connect.first-run-onboarding` | Arrive with nothing set up and be walked to a way in | 🟢 covered | smoke | `no-chain` | `17-onboarding.cy.js` (ONB-01, ONB-02, ONB-03) |  |

### `054-callsign-registry` — Callsigns

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `callsign.commit-reveal-register` | Register a %callsign through commit and reveal | 🔴 absent | none | — (proposed: on-chain) | #1241 |  |
| `callsign.resolve-in-address-entry` | Address a transfer to someone by their callsign | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |
| `callsign.gated-below-gold` | Be told why registration is unavailable below Gold tier | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |

### `057-predict-polymarket` — Predict — Polymarket

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.hidden-off-polygon` | See the Predict tab hidden on a chain Polymarket does not serve | 🔴 absent | none | — (proposed: no-chain) | #1239 |  |

### `066-staking-admin-controls` — Staking admin controls

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.staking-controls` | An operator pauses or retires a staking route | 🔴 absent | none | — (proposed: on-chain) | #1237 |  |

### `069-network-endpoints-user-panel` — Network endpoints

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `endpoints.save-custom-rpc` | Save your own RPC endpoint and have reads use it | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |
| `endpoints.wrong-chain-refused` | Be refused an endpoint that answers with a different chain id | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |
| `endpoints.credentials-redacted` | Never see your endpoint credential rendered back to you | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |

### `071-multi-chain-admin-console` — Multi-chain admin console

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.estate-reads-three-state` | An operator reads the estate and sees not-deployed and unreadable distinguished from zero | 🟡 partial | smoke | `on-chain` | `15-admin-panel.cy.js` (ADM-01, ADM-02) | the two admin tests check the panel renders; no test asserts the three-state reads, and none proves an unreachable chain is not rendered as a zero |
| `admin.single-chain-write` | An operator writes to one named chain with authority read from that chain | 🔴 absent | none | — (proposed: on-chain) | #1242 |  |

### `072-white-label-tenants` — White-label tenants

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `tenant.brand-resolves-from-manifest` | A tenant build shows its own identity and no other tenant's | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |

### `073-miniapp-platform` — Mini-app platform

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.launch-verified-package` | Launch a mini-app whose bytes are verified against the chain | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |
| `miniapp.launchable-not-status` | A live app whose update is in review still launches | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |
| `miniapp.curator-approve-content-committed` | A curator approval is refused when the package changed under it | 🔴 absent | none | — (proposed: on-chain) | #1238 |  |

### `084-message-signing-verify` — Message signing and Verify

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `verify.three-verdicts` | Verify a signature and get valid, invalid, or unverifiable — never a forged-looking result from an RPC timeout | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |
| `verify.refused-while-operating-as-vault` | Be refused message signing while acting as a vault | 🔴 absent | none | — (proposed: no-chain) | #1241 |  |

### `093-admin-mini-apps` — Admin mini-apps

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `admin.control-room-gating` | An operator sees granted, denied, or could-not-verify — never a silent denial | 🔴 absent | none | — (proposed: on-chain) | #1242 |  |
| `admin.maintenance-permissionless` | Any entrant reaches Maintenance without elevated status | 🔴 absent | none | — (proposed: no-chain) | #1242 |  |

## Information — read-only surfaces

32 flows — 🟢 15 · 🟡 1 · 🔴 16 · ⚪ 0 · covered-but-not-proven 12

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
| `legal.read-versioned-policies` | Open terms, risk and privacy from the footer before connecting | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `011-wallet-address-qr` — Wallet address QR

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `receive.show-address-qr` | Show your address as a QR for someone to send to | 🟢 covered | smoke | `no-chain` | `12-sharing-ui.cy.js` (SHR-05, SHR-06, SHR-07, SHR-08) |  |

### `012-wager-notifications` — Wager notifications

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.wager-state-change` | Be notified when a wager you are in changes state | 🔴 absent | none | — (proposed: on-chain) | #1245 |  |

### `013-polymarket-search-filter` — Polymarket search and filter

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `predict.search-markets` | Search and filter Polymarket markets when choosing a condition | 🔴 absent | none | — (proposed: no-chain) | #1239 |  |

### `014-quick-action-dashboard` — Quick-action dashboard

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `home.quick-actions` | Reach the common actions from the home screen | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-01, DSH-02, DSH-03, DSH-04) |  |

### `016-wager-tax-report` — Wager tax report

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `reports.export-wager-history` | Export a settled-wager report for tax purposes | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

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
| `oracle.graph-unavailable-degrades` | See an honest degraded state when the oracle index is unreachable | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `031-platform-notifications` — Platform notifications

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.platform-feed` | See platform notifications and clear them | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

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
| `portfolio.see-holdings` | See what the connected account holds across supported assets | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `047-mask-sensitive-values` — Mask sensitive values

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `privacy.mask-balances` | Hide balances on screen when someone is looking over your shoulder | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `051-unified-activity-ledger` — Activity ledger

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `activity.see-unified-history` | See one history across wagers, transfers and membership | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `059-notification-profiles` — Notification profiles

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `notifications.choose-profile` | Choose how much you are notified | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `064-universal-asset-selector` — Universal asset selector

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `assets.pick-any-supported-asset` | Pick any supported asset from one selector | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `068-protect-multi-chain-policies` — Protect — policy v2

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `custody.multi-chain-vault-list` | See vaults across chains, with a failed chain named rather than shown as empty | 🔴 absent | none | — (proposed: no-chain) | #1235 |  |

### `074-unified-my-account` — My Account

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.unified-panel` | Reach preferences, membership and network from one account panel | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `077-miniapp-store-redesign` — Mini-app store

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `miniapp.browse-catalog` | Browse the app catalogue and pin an app to quick access | 🔴 absent | none | — (proposed: no-chain) | #1238 |  |

### `078-my-wagers-single-table-view` — My Wagers single table

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `wagers.single-table-view` | See every wager you are in as one table | 🟢 covered | smoke | `no-chain` | `13-dashboard.cy.js` (DSH-05, DSH-06) |  |

### `081-nav-drawer-density` — Nav drawer density

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `nav.drawer-sections-and-density` | Fold nav sections and choose a compact density that survives a reload | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

### `082-perps-trade-view` — Perps market data

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `perps.browse-venues` | Compare perpetuals pairs across venues | 🟢 covered | flow | `no-chain` | `24-perps.cy.js` (PERPS-01, PERPS-02, PERPS-03, PERPS-04, PERPS-05) |  |
| `perps.degraded-venue-named` | A degraded venue is named and its pairs omitted, never shown as zeros | 🟡 partial | smoke | `no-chain` | `24-perps.cy.js` (PERPS-04) | no assertion proves a missing metric renders as an em dash rather than a zero, which is the invariant the spec turns on |

### `083-perps-position-management` — Perps positions

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `perps.read-positions` | Read your open positions without being offered a way to trade them here | 🟢 covered | flow | `no-chain` | `25-perps-management.cy.js` |  |

### `086-account-cards` — Account cards

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `account.cards` | See your accounts as cards and switch between them | 🟢 covered | smoke | `no-chain` | `26-trade-account.cy.js` |  |

### `092-multi-chain-activity` — Multi-chain activity

| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |
|---|---|---|---|---|---|---|
| `activity.multi-chain-history` | See activity across chains, with an unreadable chain named rather than empty | 🔴 absent | none | — (proposed: no-chain) | #1245 |  |

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

