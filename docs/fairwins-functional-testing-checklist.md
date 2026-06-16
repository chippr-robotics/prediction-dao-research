# FairWins Functional Testing Checklist

A manual testing checklist for validating all functional flows of the FairWins peer-to-peer wager platform. Each test case has a checkbox, ID, description, steps, and expected result. Tests are grouped by functional area with happy-path and non-happy-path coverage.

**How to use:** Work through each section in order. Check the box when a test passes. Add notes in the "Tester Notes" column for failures or observations. Sections 18-22 are cross-cutting concerns that should be tested after completing the core flows.

**Environment:** Polygon Amoy testnet (chain ID 80002) unless otherwise noted.

---

## Table of Contents

1. [Wallet Connection & Network](#1-wallet-connection--network)
2. [Membership & Tiers](#2-membership--tiers)
3. [Encryption & Key Registration](#3-encryption--key-registration)
4. [Wager Creation](#4-wager-creation)
5. [Wager Acceptance](#5-wager-acceptance)
6. [Wager Decline & Cancellation](#6-wager-decline--cancellation)
7. [Manual Resolution](#7-manual-resolution)
8. [Oracle Resolution](#8-oracle-resolution)
9. [Challenge & Dispute](#9-challenge--dispute)
10. [Claim Winnings & Payouts](#10-claim-winnings--payouts)
11. [Refund & Timeout Flows](#11-refund--timeout-flows)
12. [Sharing (QR Code & Link)](#12-sharing-qr-code--link)
13. [Dashboard & Wager Management](#13-dashboard--wager-management)
14. [Demo Mode](#14-demo-mode)
15. [Admin Panel](#15-admin-panel)
16. [Privacy & Encryption (End-to-End)](#16-privacy--encryption-end-to-end)
17. [Onboarding & Tutorial](#17-onboarding--tutorial)
18. [Cross-Cutting: Frozen Accounts](#18-cross-cutting-frozen-accounts)
19. [Cross-Cutting: Paused Protocol](#19-cross-cutting-paused-protocol)
20. [Cross-Cutting: Expired Membership](#20-cross-cutting-expired-membership)
21. [Cross-Cutting: Network & Transaction Errors](#21-cross-cutting-network--transaction-errors)
22. [Accessibility & UI](#22-accessibility--ui)

---

## 1. Wallet Connection & Network

**Preconditions:** Browser with MetaMask (or WalletConnect-compatible wallet) installed. Polygon Amoy network configured.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | WAL-01 | Connect wallet via MetaMask | 1. Open FairWins app 2. Click "Connect Wallet" 3. Select MetaMask 4. Approve connection in MetaMask | Wallet connects; address and balances (MATIC, USDC) displayed in header; dashboard loads |  |
| [ ] | WAL-02 | Connect wallet via WalletConnect | 1. Click "Connect Wallet" 2. Select WalletConnect 3. Scan QR or approve in mobile wallet | Wallet connects; address displayed; app functional |  |
| [ ] | WAL-03 | Display wallet balances | 1. Connect wallet with known balances | MATIC, USDC, and WMATIC balances shown correctly with proper decimal formatting |  |
| [ ] | WAL-04 | Disconnect wallet | 1. Connect wallet 2. Navigate to Wallet page > Account tab 3. Click "Disconnect" | Wallet disconnects; app returns to welcome/connect view; no residual state |  |
| [ ] | WAL-05 | Auto-reconnect disabled | 1. Connect wallet 2. Refresh page | Wallet does NOT auto-connect; user must manually reconnect |  |
| [ ] | WAL-06 | Switch between Testnet and Mainnet | 1. Connect on Amoy 2. Use network mode toggle in wallet button area | Network switches; contract addresses update; data re-fetches |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | WAL-07 | Reject wallet connection | 1. Click "Connect Wallet" 2. Select MetaMask 3. Reject in MetaMask popup | Error message: "Connection request was rejected"; app remains in disconnected state |  |
| [ ] | WAL-08 | Connect on wrong network | 1. Set MetaMask to Ethereum Mainnet 2. Connect to FairWins | Network error banner displayed with "Switch Network" button; features gated |  |
| [ ] | WAL-09 | Switch to correct network from banner | 1. Trigger WAL-08 2. Click "Switch Network" button | MetaMask prompts network switch; on approval, banner disappears and app becomes functional |  |
| [ ] | WAL-10 | No wallet extension installed | 1. Open FairWins in browser without MetaMask | MetaMask option shows "Not detected" or equivalent; WalletConnect remains available |  |
| [ ] | WAL-11 | Switch account in MetaMask mid-session | 1. Connect wallet 2. Switch to different account in MetaMask | App detects account change; updates address and balances; role/membership reflects new account |  |

---

## 2. Membership & Tiers

**Preconditions:** Wallet connected on Polygon Amoy. Sufficient USDC balance for tier purchase. USDC token approved or ready to approve.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | MEM-01 | Purchase Bronze tier | 1. Navigate to Wallet page > Membership tab 2. Click purchase/get membership 3. Select Bronze ($2 USDC) 4. Review operator powers acknowledgement 5. Accept terms 6. Confirm USDC approval tx 7. Confirm purchase tx | Membership granted; WAGER_PARTICIPANT role active; tier shows Bronze; expiry set 30 days out |  |
| [ ] | MEM-02 | Purchase Silver tier | Same as MEM-01 but select Silver ($8 USDC) | Silver tier active; limits: 30 wagers/month, 10 concurrent |  |
| [ ] | MEM-03 | Purchase Gold tier | Same as MEM-01 but select Gold ($25 USDC) | Gold tier active; limits: 100 wagers/month, 30 concurrent |  |
| [ ] | MEM-04 | Purchase Platinum tier | Same as MEM-01 but select Platinum ($100 USDC) | Platinum tier active; unlimited wagers and concurrent |  |
| [ ] | MEM-05 | Upgrade from Bronze to Silver | 1. Have active Bronze membership 2. Navigate to Membership tab 3. Click upgrade 4. Select Silver 5. Confirm payment of delta ($6 USDC) | Tier upgrades to Silver; expiry unchanged; limits updated; delta charged |  |
| [ ] | MEM-06 | Extend membership (renew) | 1. Have active membership 2. Click extend/renew 3. Confirm full tier price payment | Expiry extended by 30 days from current expiry; monthly counter reset |  |
| [ ] | MEM-07 | View membership status | 1. Navigate to Wallet page > Membership tab | Current tier, expiry date, monthly usage count, and concurrent count displayed |  |
| [ ] | MEM-08 | Auto-register encryption key on purchase | 1. Purchase membership (first time, no key registered) | After purchase completion, app offers to register encryption key; key registration transaction triggered |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | MEM-09 | Purchase with insufficient USDC | 1. Have < $2 USDC 2. Attempt Bronze purchase | Error: "Insufficient balance"; transaction not submitted |  |
| [ ] | MEM-10 | Purchase when already active | 1. Have active Bronze 2. Attempt to purchase Bronze again | Error: "AlreadyActive"; use upgrade or extend instead |  |
| [ ] | MEM-11 | Downgrade tier (Silver to Bronze) | 1. Have active Silver 2. Attempt to purchase Bronze | Error: "NotUpgrade"; downgrades not permitted |  |
| [ ] | MEM-12 | Reject USDC approval transaction | 1. Begin tier purchase 2. Reject the ERC-20 approval in MetaMask | Purchase flow halts; error message shown; no funds deducted |  |
| [ ] | MEM-13 | Membership expiry prevents wager creation | 1. Have expired membership 2. Attempt to create wager | Error: "MembershipRequired" or "MembershipDenied"; wager not created |  |

---

## 3. Encryption & Key Registration

**Preconditions:** Wallet connected. Active membership (for creation flows).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ENC-01 | Derive encryption key (first time) | 1. Trigger action requiring encryption (e.g., create private wager) 2. Sign message in MetaMask when prompted | Key derived; cached in browser session storage; no further prompts in same session |  |
| [ ] | ENC-02 | Register key on-chain via KeyRegistry | 1. Navigate to Wallet page > Security tab 2. Click "Register Key" 3. Confirm transaction | Public key registered on-chain; "Key Registered" status shown; key queryable by others |  |
| [ ] | ENC-03 | Check key registration status | 1. Navigate to Wallet page > Security tab 2. Click "Check Status" | Shows whether key is registered on-chain with current status (local-only vs registered) |  |
| [ ] | ENC-04 | Key persists within session | 1. Derive key 2. Navigate away and back 3. Create another encrypted wager | No re-prompt for signature; key reused from session cache |  |
| [ ] | ENC-05 | Key cleared on tab close | 1. Derive key 2. Close browser tab 3. Reopen FairWins 4. Trigger encryption action | Prompted to sign again to re-derive key |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ENC-06 | Reject key derivation signature | 1. Trigger encryption action 2. Reject signature in MetaMask | Error: "Encryption not initialized"; private wager creation blocked |  |
| [ ] | ENC-07 | Create encrypted wager when opponent has no registered key | 1. Set encryption toggle ON 2. Enter opponent address that has NOT registered a key | Warning displayed: opponent must register encryption key first; creation blocked |  |

---

## 4. Wager Creation

**Preconditions:** Wallet connected. Active membership (any tier). Sufficient stake tokens.

### Happy Path - 1v1 Wager

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CRE-01 | Create 1v1 wager with USDC | 1. Click "Create 1v1" on Dashboard 2. Enter opponent address 3. Enter description 4. Set stake: 10 USDC 5. Set duration: 7 days 6. Leave the default settler (Me) 7. Submit 8. Approve USDC spend 9. Confirm creation tx | Wager created; status "Pending Acceptance"; appears in dashboard; share modal opens with QR/link |  |
| [ ] | CRE-02 | Create 1v1 wager with native MATIC | 1. Same as CRE-01 but select MATIC as stake token | Single transaction (no approval needed); wager created with MATIC stake |  |
| [ ] | CRE-03 | Create 1v1 wager with WMATIC | 1. Same as CRE-01 but select WMATIC | WMATIC approval + creation; wager created |  |
| [ ] | CRE-04 | Create wager with "Me" (Creator) settler | 1. Create 1v1 2. Choose "Me" as the settler | Wager created; only creator can propose resolution after end date |  |
| [ ] | CRE-05 | Create wager with "Them" (Opponent) settler | 1. Create 1v1 2. Choose "Them" as the settler | Wager created; only opponent can propose resolution |  |
| [ ] | CRE-06 | Create wager with "A Friend" (Third Party) settler | 1. Create 1v1 2. Choose "A Friend" as the settler 3. Enter a neutral arbitrator's address | Wager created; only the named arbitrator can declare the winner, and it appears in their **Arbitrating** tab (the WagerRegistry per-user index records the arbitrator — Spec Kit 005) |  |
| [ ] | CRE-07 | Create private (encrypted) wager | 1. Create 1v1 2. Toggle "Private Wager" ON 3. Ensure opponent has registered key 4. Complete creation | Wager created; metadata encrypted and stored on IPFS; on-chain metadataUri = `encrypted:ipfs://<CID>` |  |
| [ ] | CRE-08 | Create wager with custom acceptance deadline | 1. Create 1v1 2. Set acceptance deadline to 24 hours | Wager created with specified deadline; deadline enforced on-chain |  |
| [ ] | CRE-09 | Create wager with custom end date | 1. Create 1v1 2. Set end date to 14 days | Wager created; resolveDeadline reflects chosen end date |  |

### Happy Path - Small Group Wager

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CRE-10 | Create small group wager | 1. Click "Create Group" 2. Add 2-4 member addresses 3. Set member limit (3-10) 4. Set minimum acceptance threshold (2) 5. Complete form and submit | Group wager created; all invited members listed; pending acceptance |  |

### Happy Path - Make an Offer Wager

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CRE-11 | Create Offer wager with asymmetric odds | 1. Create wager 2. Select "Make an Offer" 3. Choose who settles (Me/Them) — the settler puts up the majority stake 4. Set stake: 50 USDC (headline) 5. Set odds multiplier (e.g., 300 = 3x) | Wager created with asymmetric stakes; the settler stakes the majority (e.g. 100 vs 50); payout reflects odds |  |

### Happy Path - Oracle-Pegged Wagers

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CRE-12 | Create Polymarket-pegged wager | 1. Create 1v1 2. Set resolution to "Polymarket Auto" 3. Browse Polymarket markets in picker 4. Select a market and choose side (YES/NO) 5. Complete creation | Wager created with polymarketConditionId linked; PolymarketLinked event emitted; auto-description populated |  |
| [ ] | CRE-13 | Create Chainlink Data Feed-pegged wager | 1. Create 1v1 2. Set resolution to "Chainlink Data Feed" 3. Select oracle condition from OracleConditionPicker dropdown 4. Choose side 5. Complete creation | Wager created with oracle condition linked; OracleConditionLinked event emitted |  |
| [ ] | CRE-14 | Create Chainlink Functions-pegged wager | 1. Same as CRE-13 but select "Chainlink Functions" resolution | Wager created with Functions condition linked |  |
| [ ] | CRE-15 | Create UMA-pegged wager | 1. Same as CRE-13 but select "UMA" resolution | Wager created with UMA condition linked |  |
| [ ] | CRE-16 | Browse Polymarket markets in picker | 1. Open creation modal 2. Select Polymarket resolution 3. Use search, category filters (Politics, Sports, Crypto, etc.) | Markets load; filtering works; search debounces; market details (volume, description) displayed |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CRE-17 | Create wager without membership | 1. Connect wallet with no active membership 2. Attempt to create wager | Error: "MembershipRequired"; creation blocked; CTA to purchase membership shown |  |
| [ ] | CRE-18 | Create wager exceeding monthly limit | 1. Have Bronze tier 2. Create 15 wagers in current month 3. Attempt 16th | Error: monthly creation limit reached; creation blocked |  |
| [ ] | CRE-19 | Create wager exceeding concurrent limit | 1. Have Bronze tier 2. Have 5 open/active wagers 3. Attempt to create 6th | Error: concurrent market limit reached; creation blocked |  |
| [ ] | CRE-20 | Create wager with self as opponent | 1. Enter own wallet address as opponent | Error: "SelfWager" or validation error; creation blocked |  |
| [ ] | CRE-21 | Create wager with zero stake | 1. Set stake amount to 0 | Form validation prevents submission; or contract reverts "ZeroStake" |  |
| [ ] | CRE-22 | Create wager exceeding max stake (1,000) | 1. Set stake amount to 1,001 | Form validation prevents submission; or contract reverts |  |
| [ ] | CRE-23 | Create wager with insufficient balance | 1. Set stake to 500 USDC with only 100 USDC in wallet | Error: "Insufficient balance"; transaction not submitted |  |
| [ ] | CRE-24 | Create "A Friend" wager without arbitrator | 1. Choose "A Friend" as the settler 2. Leave the arbitrator address empty 3. Submit | Form validation blocks submission; the arbitrator address is required for the Friend settler |  |
| [ ] | CRE-25 | Create wager with invalid opponent address | 1. Enter malformed address as opponent | Form validation catches invalid address; creation blocked |  |
| [ ] | CRE-26 | Create Polymarket wager with already-resolved condition | 1. Select a Polymarket market that has already resolved | Error: "ConditionAlreadyResolved"; creation blocked |  |
| [ ] | CRE-27 | Create wager with non-allowlisted token | 1. Attempt to use a token not in the allowlist | Error: "NotAllowedToken"; creation blocked |  |
| [ ] | CRE-28 | Reject approval transaction during creation | 1. Begin wager creation with USDC 2. Reject ERC-20 approval in MetaMask | Flow halts at approval step; no wager created; retry available |  |
| [ ] | CRE-29 | Reject creation transaction after approval | 1. Approve USDC spend 2. Reject the creation transaction | Flow halts; approval consumed but no wager created; user can retry |  |
| [ ] | CRE-30 | Create oracle wager when adapter not deployed | 1. Select Chainlink resolution type 2. Adapter not configured on current chain | OracleConditionPicker shows no conditions; or error "OracleAdapterNotSet" |  |

---

## 5. Wager Acceptance

**Preconditions:** An open wager exists targeting the test wallet as opponent. Wallet connected. Sufficient stake tokens.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ACC-01 | Accept 1v1 wager via link | 1. Open wager acceptance link 2. Connect wallet (invited address) 3. Review wager terms 4. Click "Accept" 5. Approve token spend (if ERC-20) 6. Confirm acceptance tx | Wager status transitions to Active; opponent stake locked in escrow; wager appears in both parties' dashboards |  |
| [ ] | ACC-02 | Accept wager with native MATIC | 1. Open wager using MATIC as stake 2. Click Accept 3. Confirm single transaction | Accepted with one transaction (no approval step) |  |
| [ ] | ACC-03 | Accept encrypted wager (auto-decrypt) | 1. Open encrypted wager link 2. Connect with invited wallet 3. Sign key derivation if prompted | Wager description auto-decrypts; full terms visible; accept flow proceeds normally |  |
| [ ] | ACC-04 | View acceptance countdown timer | 1. Open pending wager | Countdown timer shows time remaining until acceptance deadline |  |
| [ ] | ACC-05 | Accept group wager (threshold met) | 1. Group wager with min threshold 2 2. Second participant accepts | Status transitions to Active once threshold met |  |
| [ ] | ACC-06 | Accept group wager (threshold not yet met) | 1. Group wager with min threshold 3 2. First participant accepts | Status remains Pending Acceptance; acceptance recorded; waiting for more participants |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ACC-07 | Accept with wrong wallet address | 1. Open wager link 2. Connect with address NOT invited | Error: "NotInvited"; accept button disabled or transaction reverts |  |
| [ ] | ACC-08 | Accept after deadline expired | 1. Open wager where acceptance deadline has passed | Error: "DeadlinePassed" or "AcceptExpired"; acceptance blocked; wager shows expired status |  |
| [ ] | ACC-09 | Accept already-accepted wager | 1. Accept a wager 2. Attempt to accept same wager again | Error: "AlreadyAccepted"; no duplicate acceptance |  |
| [ ] | ACC-10 | Accept with insufficient balance | 1. Open wager requiring 100 USDC 2. Have only 50 USDC | Error: "Insufficient balance"; transaction not submitted |  |
| [ ] | ACC-11 | View encrypted wager without correct wallet | 1. Open encrypted wager link 2. Connect with non-invited wallet | Shows "Encrypted Market" with no readable details; no accept option |  |
| [ ] | ACC-12 | Accept wager when account is frozen | 1. Have frozen account 2. Attempt to accept wager | Error: "AccountFrozenError"; acceptance blocked |  |
| [ ] | ACC-13 | Reject approval during acceptance | 1. Click Accept on USDC wager 2. Reject approval in MetaMask | Acceptance halts; no stake transferred; can retry |  |

---

## 6. Wager Decline & Cancellation

**Preconditions:** Relevant open wagers exist.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DEC-01 | Decline a pending wager (opponent) | 1. Open wager as invited opponent 2. Click "Decline" 3. Confirm transaction | Wager cancelled; creator's stake refunded; wager removed from active lists; WagerDeclined event emitted |  |
| [ ] | DEC-02 | Cancel an open wager (creator) | 1. Open own pending wager as creator 2. Click "Cancel" 3. Confirm transaction | Wager cancelled; creator's stake refunded; WagerCancelled event emitted |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DEC-03 | Decline wager as non-opponent | 1. View wager as a third party (not creator, not opponent) | No decline option available; or transaction reverts "NotOpponent" |  |
| [ ] | DEC-04 | Cancel wager as non-creator | 1. View wager as opponent 2. Attempt to cancel | No cancel option available; or transaction reverts "NotCreator" |  |
| [ ] | DEC-05 | Cancel/decline after wager is Active | 1. Wager has been accepted (Active) 2. Attempt cancel or decline | No cancel/decline option; wager must proceed to resolution or timeout |  |
| [ ] | DEC-06 | Decline wager when account is frozen | 1. Frozen opponent account 2. Attempt to decline | Error: "AccountFrozenError"; decline blocked |  |

---

## 7. Manual Resolution

**Preconditions:** Active wager exists. Trading period (end date) has passed. Wager uses a participant settler — **Me** (Creator) or **Them** (Opponent) — or **A Friend** (Third Party arbitrator). Legacy **Either Party** wagers still resolve but are no longer creatable (see CRE-01).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | RES-01 | Resolve (Me — Creator settler) | 1. Open active "Me" wager past end date 2. As creator, click "Propose Resolution" 3. Select outcome (True = creator wins) 4. Confirm transaction | Resolution proposed; challenge period begins (24h); status transitions toward Resolved |  |
| [ ] | RES-02 | Resolve (Them — Opponent settler) | 1. As opponent on a "Them" wager 2. Propose resolution (False = opponent wins) | Resolution proposed; same flow as RES-01 but initiated by opponent |  |
| [ ] | RES-03 | Resolve (legacy Either Party) | 1. On a pre-existing Either Party wager 2. As either side, propose resolution | Resolution accepted; either participant may propose (legacy wagers only) |  |
| [ ] | RES-04 | Resolve (A Friend — Third Party) - arbitrator resolves | 1. As the named arbitrator on a "A Friend" wager 2. Declare the winner | Resolution accepted; only the arbitrator can declare |  |
| [ ] | RES-06 | Finalize resolution after challenge period (no challenge) | 1. Resolution proposed 24+ hours ago 2. No challenge filed 3. Click "Finalize" | Wager status transitions to Resolved; winner can now claim |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | RES-07 | Propose resolution before end date | 1. Active wager still within trading period 2. Attempt to propose resolution | Error: "NotPendingResolution"; resolution blocked until end date passes |  |
| [ ] | RES-08 | Opponent proposes on a "Me" (Creator) wager | 1. "Me" settler wager 2. Opponent attempts to propose | Error: "NotAuthorized"; only creator allowed |  |
| [ ] | RES-09 | Creator proposes on a "Them" (Opponent) wager | 1. "Them" settler wager 2. Creator attempts to propose | Error: "NotAuthorized"; only opponent allowed |  |
| [ ] | RES-10 | Non-arbitrator proposes on a "A Friend" wager | 1. "A Friend" settler wager 2. A participant (not the arbitrator) attempts to declare | Error: "NotAuthorized"; only the named arbitrator allowed |  |
| [ ] | RES-11 | Propose resolution after resolve deadline | 1. Active wager past resolveDeadline 2. Attempt to propose | Error: "ResolveExpired"; refund path available instead |  |
| [ ] | RES-12 | Manual resolution on oracle-type wager | 1. Polymarket/Chainlink/UMA wager 2. Attempt declareWinner | Error: oracle-resolved types cannot use manual resolution |  |
| [ ] | RES-13 | Propose with winner not a participant | 1. Attempt to declare a third-party address as winner | Error: "WinnerNotParticipant"; winner must be creator or opponent |  |
| [ ] | RES-14 | Resolve when account is frozen | 1. Authorized resolver has frozen account 2. Attempt to propose resolution | Error: "AccountFrozenError" |  |

### Draw Resolution (Spec Kit 004)

**Preconditions:** Active, fully-funded wager past its end date, within the resolve deadline. A draw returns each party their own original stake (no winner). Manual draws apply to participant types (Either/Creator/Opponent, mutual consent) and ThirdParty (arbitrator solo); oracle types draw only on a tie.

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DRW-01 | Propose a draw (participant) | 1. As creator on an Either/Creator/Opponent wager, open Resolve 2. Choose "Draw — both parties refunded" 3. Confirm | "Draw Proposed"; wager stays Active; no funds move yet; counterparty can confirm |  |
| [ ] | DRW-02 | Confirm a draw (counterparty) | 1. After DRW-01, the other participant opens Resolve 2. Choose Draw 3. Confirm | "Settled as a Draw"; each party receives their OWN original stake back; status shows "Draw" in History |  |
| [ ] | DRW-03 | Draw does not lock the wager | 1. One party proposes a draw 2. The authorized resolver instead declares a winner | Winner resolution still succeeds; the pending draw proposal is ignored |  |
| [ ] | DRW-04 | Arbitrator draws solo (ThirdParty) | 1. On a pre-existing ThirdParty wager, arbitrator opens Resolve 2. Choose Draw 3. Confirm | Draw settles immediately; both stakes returned |  |
| [ ] | DRW-05 | Unequal stakes draw | 1. Draw a wager with unequal stakes (e.g. 30 vs 10) | Each party gets exactly their own stake back (creator 30, opponent 10); sum returned == sum escrowed |  |
| [ ] | DRW-06 | No manual draw on oracle wagers | 1. Open a Polymarket/Chainlink/UMA wager | No manual Resolve/Draw control is offered (oracle auto-resolves) |  |
| [ ] | DRW-07 | Polymarket tie auto-draws | 1. Polymarket market resolves as a tie (equal payout) 2. Trigger auto-resolve | Wager settles as a Draw immediately; both stakes returned (no deadline wait) |  |
| [ ] | DRW-08 | Draw after resolve deadline blocked | 1. Active wager past resolveDeadline 2. Attempt a manual draw | Error: "ResolveExpired"; the timeout Claim Refund path applies instead |  |
| [ ] | DRW-09 | Draw is final | 1. After a settled draw, attempt declareWinner / declareDraw / claimPayout / claimRefund | All revert (wager is terminal in the Draw state) |  |
| [ ] | DRW-10 | Withdraw a draw proposal | 1. Propose a draw 2. Withdraw it | Proposal cleared; an opponent-only later consent does not settle |  |

---

## 8. Oracle Resolution

**Preconditions:** Active wager with oracle resolution type. Oracle condition exists and is expected to resolve.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ORC-01 | Polymarket auto-resolution (creator side wins) | 1. Polymarket-pegged wager is Active 2. Polymarket market resolves to YES 3. Creator chose YES side 4. Call autoResolveFromPolymarket (or wait for trigger) | Wager resolved; creator = winner; status = Resolved; WagerResolved event emitted |  |
| [ ] | ORC-02 | Polymarket auto-resolution (opponent side wins) | 1. Same as ORC-01 but Polymarket resolves to NO and creator chose YES | Opponent = winner |  |
| [ ] | ORC-03 | Chainlink Data Feed resolution | 1. Chainlink-pegged wager Active 2. Deadline passes 3. Price feed data meets condition (e.g., BTC > threshold) 4. Call autoResolveFromOracle | Wager resolved based on price comparison; winner determined by condition outcome and chosen side |  |
| [ ] | ORC-04 | Chainlink Functions resolution | 1. Functions-pegged wager Active 2. requestResolution called 3. DON returns result via fulfillRequest callback | Wager resolved based on DON response (0 or 1) |  |
| [ ] | ORC-05 | UMA resolution (assertion undisputed) | 1. UMA-pegged wager Active 2. assertResolution called with bond 3. Liveness window passes without dispute | Assertion confirmed; wager resolved; winner based on assertedTruthfully |  |
| [ ] | ORC-06 | Permissionless Polymarket trigger | 1. Polymarket wager ready to resolve 2. A THIRD PARTY (not creator or opponent) calls autoResolveFromPolymarket | Resolution succeeds; anyone can trigger oracle resolution |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ORC-07 | Oracle not yet resolved | 1. Polymarket market still trading 2. Attempt autoResolveFromPolymarket | Error: "ConditionNotResolved"; wager stays Active |  |
| [ ] | ORC-08 | Chainlink feed data stale | 1. Chainlink-pegged wager 2. Feed data updatedAt < deadline 3. Attempt evaluate | Error: "StaleFeedData"; condition not evaluated |  |
| [ ] | ORC-09 | Chainlink Functions DON returns error | 1. Functions-pegged wager 2. DON fulfillRequest returns error bytes | RequestFailed event emitted; wager stays Active; no resolution |  |
| [ ] | ORC-10 | UMA assertion disputed | 1. UMA-pegged wager 2. Assertion made 3. Counter-party disputes | AssertionDisputed event; awaits DVM resolution; wager stays Active |  |
| [ ] | ORC-11 | Oracle adapter not configured | 1. Create wager with oracle type 2. Adapter not set on contract | Error: "AdapterNotSet" or "OracleAdapterNotSet" at creation or resolution |  |
| [ ] | ORC-12 | Oracle timeout (30 days) | 1. Oracle-pegged wager 2. 30+ days pass without oracle resolution 3. Call claimRefund | Both parties refunded; wager status = Refunded |  |

---

## 9. Challenge & Dispute

**Preconditions:** Active wager with a participant settler (**Me** or **Them**). Resolution has been proposed. Within challenge period (24 hours).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CHL-01 | Challenge a proposed resolution | 1. Opponent sees proposed resolution (creator wins) 2. Disagrees with outcome 3. Click "Challenge Resolution" 4. Confirm transaction | Challenge filed; wager status = Challenged; arbitrator notified (if designated) |  |
| [ ] | CHL-02 | Arbitrator resolves challenged wager | 1. Wager is Challenged 2. Arbitrator reviews evidence 3. Arbitrator calls resolveDispute with correct outcome | Wager resolved with arbitrator's decision; winner determined; can claim |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CHL-03 | Challenge after challenge period expired | 1. Wait 24+ hours after resolution proposed 2. Attempt to challenge | Error: "ChallengePeriodNotExpired" (for finalization) or challenge window closed |  |
| [ ] | CHL-04 | Challenge an already-challenged resolution | 1. Resolution already challenged 2. Attempt second challenge | Error: "AlreadyChallenged"; only one challenge per resolution |  |
| [ ] | CHL-05 | Finalize before challenge period ends | 1. Resolution proposed < 24 hours ago 2. Attempt to finalize | Error: "ChallengePeriodNotExpired"; must wait for full period |  |

---

## 10. Claim Winnings & Payouts

**Preconditions:** Resolved wager where the test wallet is the winner.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CLM-01 | Claim winnings (1v1 USDC) | 1. Open resolved wager where you are winner 2. Click "Claim Winnings" 3. Confirm transaction | Both stakes (creator + opponent) transferred to winner's wallet; PayoutClaimed event emitted |  |
| [ ] | CLM-02 | Claim winnings (MATIC) | 1. Resolved MATIC wager 2. Claim winnings | Native MATIC transferred to winner |  |
| [ ] | CLM-03 | Verify payout amount | 1. Creator staked 100, opponent staked 100 2. Winner claims | Winner receives 200 tokens (both stakes) |  |
| [ ] | CLM-04 | Claim Offer payout (asymmetric) | 1. Offer wager: settler 100, other side 50 2. Winner claims | Winner receives 150 tokens (total pool) |  |
| [ ] | CLM-05 | Claim within 90-day window | 1. Wager resolved < 90 days ago 2. Claim | Claim succeeds normally |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | CLM-06 | Claim when not the winner | 1. Resolved wager where you lost 2. Attempt to claim | No "Claim" button visible; or error "NotWinner" |  |
| [ ] | CLM-07 | Claim twice | 1. Claim winnings successfully 2. Attempt to claim again | Error: "AlreadyPaid" or "AlreadyClaimed"; no double payout |  |
| [ ] | CLM-08 | Claim before wager resolved | 1. Active wager 2. Attempt to claim | Error: "NotResolved"; claim not available |  |
| [ ] | CLM-09 | Claim after 90-day timeout | 1. Wager resolved > 90 days ago 2. Attempt to claim | Claim blocked or funds already swept to treasury |  |
| [ ] | CLM-10 | Claim when account is frozen | 1. Winner account frozen 2. Attempt to claim | Error: "AccountFrozenError"; payout remains in escrow until unfreeze |  |

---

## 11. Refund & Timeout Flows

**Preconditions:** Various wager states as described per test.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | REF-01 | Refund expired open wager (no acceptance) | 1. Open wager past acceptance deadline 2. No opponent accepted 3. Call claimRefund | Creator's stake returned; wager status = Refunded; WagerRefunded event with opponent = address(0) |  |
| [ ] | REF-02 | Refund timed-out active wager | 1. Active wager past resolveDeadline 2. No resolution occurred 3. Call claimRefund | Both creator and opponent receive their original stakes back; status = Refunded |  |
| [ ] | REF-03 | Third party triggers refund | 1. Wager eligible for refund 2. A neutral third party (not creator/opponent) calls claimRefund | Refund succeeds; stakes go to original stakeholders (not the caller) |  |
| [ ] | REF-04 | Oracle timeout mutual refund | 1. Oracle-pegged wager 2. 30+ days without oracle result 3. Trigger refund | Both parties refunded; status = Oracle Timed Out or Refunded |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | REF-05 | Claim refund before deadline | 1. Open wager still within acceptance deadline 2. Attempt claimRefund | Error: "NotRefundable"; deadline not yet passed |  |
| [ ] | REF-06 | Claim refund on active wager before resolve deadline | 1. Active wager within resolveDeadline 2. Attempt claimRefund | Error: "NotRefundable"; resolve deadline not yet passed |  |
| [ ] | REF-07 | Claim refund on already-resolved wager | 1. Wager already resolved 2. Attempt claimRefund | Error: wager not in refundable state |  |
| [ ] | REF-08 | Frozen account triggers refund | 1. Frozen caller attempts claimRefund | Error: "AccountFrozenError"; caller must be non-frozen (but stakes still go to original parties) |  |

---

## 12. Sharing (QR Code & Link)

**Preconditions:** Wager successfully created.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | SHR-01 | Share via QR code after creation | 1. Create wager 2. Share modal opens 3. QR code displayed | QR code visible with FairWins logo; scannable with mobile device; links to acceptance page |  |
| [ ] | SHR-02 | Copy share link to clipboard | 1. Share modal open 2. Click "Copy Link" | Link copied; toast confirmation; link contains wager ID and necessary parameters |  |
| [ ] | SHR-03 | Open shared link in browser | 1. Paste shared link in new browser 2. Navigate to it | MarketAcceptancePage loads; wager details displayed; accept/decline options available |  |
| [ ] | SHR-04 | Scan QR code from Dashboard | 1. Click "Scan QR Code" on Dashboard 2. Allow camera access 3. Scan valid FairWins QR code | QR detected; wager ID extracted; navigates to acceptance page |  |
| [ ] | SHR-05 | Share link contains no secrets | 1. Inspect share link URL | Link contains wager ID only (and possibly creator address, stake info for preview); no decryption keys or private data in URL |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | SHR-06 | Scan non-FairWins QR code | 1. Scan QR code linking to external URL | Confirmation dialog shown before navigating to external URL; not auto-accepted |  |
| [ ] | SHR-07 | Scan QR with camera denied | 1. Click "Scan QR Code" 2. Deny camera permission | Error message about camera access; fallback option to enter wager ID manually |  |
| [ ] | SHR-08 | Open share link for nonexistent wager | 1. Navigate to acceptance page with invalid wager ID | Error or empty state: wager not found |  |

---

## 13. Dashboard & Wager Management

**Preconditions:** Wallet connected. Some wagers in various states (pending, active, resolved, refunded).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DSH-01 | View Dashboard with quick actions | 1. Connect wallet with active membership | Quick action cards visible: Create 1v1, Create Group, Scan QR, My Wagers |  |
| [ ] | DSH-02 | View My Wagers - Participating tab | 1. Click "My Wagers" 2. Navigate to Participating tab | All wagers where user is a participant listed; shows status, stakes, opponent |  |
| [ ] | DSH-03 | View My Wagers - Created tab | 1. Navigate to Created tab | All wagers created by user listed |  |
| [ ] | DSH-04 | View My Wagers - History tab | 1. Navigate to History tab | Resolved, cancelled, and refunded wagers shown |  |
| [ ] | DSH-05 | Filter wagers by status | 1. In My Wagers 2. Apply status filter (all, pending, active, resolved) | List filters correctly; only matching wagers shown |  |
| [ ] | DSH-06 | View wager details from list | 1. Click on a wager card | Wager detail view opens; shows description, stakes, participants, status, dates, resolution type |  |
| [ ] | DSH-07 | Wager status indicators | 1. View wagers in different states | Correct status badges: Pending Acceptance, Active, Pending Resolution, Challenged, Resolved, Cancelled, Refunded, Oracle Timed Out |  |
| [ ] | DSH-08 | How-it-works collapsible section | 1. On Dashboard 2. Expand "How it works" section | 4-step explanation displayed; collapses/expands correctly |  |
| [ ] | DSH-09 | Polymarket feed on Dashboard | 1. View Dashboard (on Polygon network) | Polymarket market browser feed visible; markets with volume and categories displayed |  |
| [ ] | DSH-10 | Dashboard without membership (CTA) | 1. Connect wallet with no membership | "Get Membership" CTA banner or button shown; quick actions restricted |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DSH-11 | Empty state - no wagers | 1. Connect wallet that has never created or participated in wagers 2. Open My Wagers | Empty state message displayed; no errors |  |
| [ ] | DSH-12 | Loading state | 1. Navigate to My Wagers with slow connection | Loading spinner/skeleton shown while data fetches |  |
| [ ] | DSH-13 | Decrypt encrypted wager in list | 1. Open My Wagers with encrypted wagers 2. Wager should auto-decrypt | Encrypted wagers show decrypted description (lazy-loaded); non-participants see "Encrypted Market" |  |
| [ ] | DSH-14 | Expired pending offers hidden by default | 1. Have a pending offer whose acceptance deadline has passed 2. Open My Wagers (default "All Status") | Expired offer does not appear in Participating/Created list; empty state shown if it was the only entry |  |
| [ ] | DSH-15 | Expired filter surfaces expired offers | 1. With expired offers present 2. Set Status filter to "Expired" | Expired rows appear; Time Left reads "Expired" (not the resolve-deadline countdown); row carries a Clear action |  |
| [ ] | DSH-16 | Clear expired offer (local dismiss) | 1. View an expired offer 2. Click "Clear" (or "Reclaim & Clear" as creator) | Row disappears; dismissed id persisted under `mywagers_dismissed:<account>` so it stays hidden across reloads; creator variant also calls claimRefund on-chain |  |

---

## 14. Demo Mode

**Preconditions:** App configured with `VITE_USE_MOCK_WAGERS=true` (or demo mode toggle available).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DEM-01 | App starts in Demo Mode by default | 1. Open fresh app | "Demo Mode" badge visible; mock data displayed |  |
| [ ] | DEM-02 | Toggle Demo Mode in User Management | 1. Connect wallet 2. Open User Management Modal > Profile tab 3. Scroll to "Data Source" section | Purple "Demo Mode" badge displayed; toggle button available |  |
| [ ] | DEM-03 | Switch to Live Mode | 1. Click "Switch to Live Mode" | Badge changes to pink/red "Live Mode"; data re-fetches from blockchain |  |
| [ ] | DEM-04 | Switch back to Demo Mode | 1. From Live Mode, click "Switch to Demo Mode" | Badge returns to purple "Demo Mode"; mock data restored |  |
| [ ] | DEM-05 | Demo preference persists per wallet | 1. Set to Live Mode 2. Refresh page 3. Reconnect same wallet | Preference remembered; stays in Live Mode |  |
| [ ] | DEM-06 | Dashboard accessible without wallet in Demo Mode | 1. Demo mode active 2. Do not connect wallet | Dashboard loads with sample data; UI navigable |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | DEM-07 | Demo preference without wallet | 1. Toggle demo mode without connected wallet | Uses default (Demo); preference not persisted (no wallet to key on) |  |

---

## 15. Admin Panel

**Preconditions:** Wallet connected with appropriate admin role(s). Navigate to `/admin`.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ADM-01 | Access admin panel with admin role | 1. Connect with DEFAULT_ADMIN_ROLE wallet 2. Navigate to Admin Panel via Wallet page | Admin panel loads; tabs visible based on held roles |  |
| [ ] | ADM-02 | Overview tab - view network info | 1. Open Overview tab | Current network, pause status, accrued fees displayed |  |
| [ ] | ADM-03 | Emergency tab - pause protocol | 1. GUARDIAN_ROLE wallet 2. Emergency tab 3. Click "Pause" 4. Confirm tx | Protocol paused; all state-mutating functions blocked protocol-wide |  |
| [ ] | ADM-04 | Emergency tab - unpause protocol | 1. Protocol is paused 2. Click "Unpause" 3. Confirm tx | Protocol resumed; functions accessible again |  |
| [ ] | ADM-05 | Tiers tab - create/modify tier | 1. DEFAULT_ADMIN_ROLE 2. Tiers tab 3. Set tier price, duration, limits 4. Save | Tier configuration updated on-chain |  |
| [ ] | ADM-06 | Tiers tab - activate/deactivate tier | 1. Toggle tier active status | Tier becomes purchasable or unpurchasable |  |
| [ ] | ADM-07 | Members tab - grant membership | 1. ROLE_MANAGER_ROLE 2. Members tab 3. Enter address and tier 4. Grant | Membership granted without payment; user gains WAGER_PARTICIPANT role |  |
| [ ] | ADM-08 | Members tab - revoke membership | 1. Enter address with active membership 2. Revoke | Membership revoked; tier set to None; active wagers unaffected |  |
| [ ] | ADM-09 | Account Moderation - freeze account | 1. ACCOUNT_MODERATOR_ROLE 2. Account Moderation tab 3. Enter address and reason 4. Freeze | Account frozen; AccountFrozen event emitted with reason; user sees frozen banner |  |
| [ ] | ADM-10 | Account Moderation - unfreeze account | 1. Enter frozen address 2. Unfreeze | Account unfrozen; AccountUnfrozen event emitted; user can resume operations |  |
| [ ] | ADM-11 | Admin Roles - grant role | 1. DEFAULT_ADMIN_ROLE 2. Admin Roles tab 3. Grant GUARDIAN_ROLE to address | Role granted; address can now pause/unpause |  |
| [ ] | ADM-12 | Admin Roles - revoke role | 1. Revoke GUARDIAN_ROLE from address | Role revoked; address can no longer pause |  |
| [ ] | ADM-13 | Treasury - withdraw fees | 1. DEFAULT_ADMIN_ROLE 2. Treasury tab 3. Enter amount and destination 4. Withdraw | Accrued membership fees transferred to specified address |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ADM-14 | Access admin panel without admin role | 1. Connect with non-admin wallet 2. Navigate to /admin | Panel not accessible or shows no admin tabs; features gated by role |  |
| [ ] | ADM-15 | Pause without GUARDIAN role | 1. Non-guardian attempts pause | Transaction reverts with access control error |  |
| [ ] | ADM-16 | Freeze without ACCOUNT_MODERATOR role | 1. Non-moderator attempts freeze | Transaction reverts with access control error |  |
| [ ] | ADM-17 | Grant membership without ROLE_MANAGER role | 1. Non-role-manager attempts grant | Transaction reverts with access control error |  |

---

## 16. Privacy & Encryption (End-to-End)

**Preconditions:** Two wallets, both with registered encryption keys. Active membership on creator wallet.

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | PRV-01 | Full encrypted wager lifecycle | 1. Creator creates private wager (encryption ON) 2. Metadata encrypted for both parties 3. Stored on IPFS 4. Opponent opens link, decrypts, accepts 5. Wager resolves 6. Winner claims | Entire lifecycle works with encrypted metadata; both parties can read terms; third parties cannot |  |
| [ ] | PRV-02 | Non-participant cannot read encrypted wager | 1. Third-party wallet opens encrypted wager | Sees "Encrypted Market" only; no description, terms, or details readable |  |
| [ ] | PRV-03 | Public data visible on encrypted wager | 1. View encrypted wager as third party | Can see: participant addresses, stake amounts, token type, wager status, timestamps |  |
| [ ] | PRV-04 | IPFS metadata retrieval | 1. Create encrypted wager 2. Verify on-chain metadataUri starts with `encrypted:ipfs://` 3. Fetch CID from IPFS | Encrypted envelope retrievable from IPFS; contains encrypted keys per participant |  |
| [ ] | PRV-05 | Legacy shared-signature decryption fallback | 1. Encrypted wager created with legacy flow (shared signature in URL) 2. Opponent uses URL with signature parameter | Decryption succeeds using shared creator signature |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | PRV-06 | Decryption fails with wrong wallet | 1. Open encrypted wager 2. Connect with uninvited wallet 3. Attempt decryption | Decryption error; "Unable to decrypt" message; terms not visible |  |
| [ ] | PRV-07 | IPFS fetch fails | 1. Encrypted wager with IPFS CID 2. IPFS gateway unreachable | Graceful error; wager card shows encrypted status; retry option available |  |

---

## 17. Onboarding & Tutorial

**Preconditions:** Fresh wallet (never completed tutorial).

### Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ONB-01 | Landing page loads | 1. Navigate to root URL without wallet | Landing page with hero section, features, how-it-works, use cases, CTA buttons |  |
| [ ] | ONB-02 | Launch app from landing page | 1. Click "Launch App" or similar CTA | Navigates to /app or /fairwins; dashboard loads |  |
| [ ] | ONB-03 | Welcome view (no wallet) | 1. Navigate to dashboard without connecting wallet | Welcome view with connect wallet CTA; how-it-works steps; resolution methods cards; example wager preview |  |
| [ ] | ONB-04 | Onboarding tutorial appears (first visit) | 1. Connect wallet for first time | OnboardingTutorial modal/carousel appears with steps: Welcome, Creating, Reading Cards, Resolution, Payouts, Tips |  |
| [ ] | ONB-05 | Navigate tutorial steps | 1. Tutorial open 2. Use arrows/dots/keyboard to navigate through all steps | All steps accessible; content matches step titles; smooth transitions |  |
| [ ] | ONB-06 | Dismiss tutorial permanently | 1. Click dismiss/close on tutorial | Tutorial closes; does not reappear on subsequent visits with same wallet |  |
| [ ] | ONB-07 | Tutorial not shown on repeat visits | 1. Complete or dismiss tutorial 2. Refresh page or revisit | Tutorial does not appear again (stored in localStorage per wallet) |  |

### Non-Happy Path

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | ONB-08 | Tutorial shown for different wallet | 1. Dismiss tutorial with wallet A 2. Connect wallet B (never seen tutorial) | Tutorial appears for wallet B (per-wallet tracking) |  |

---

## 18. Cross-Cutting: Frozen Accounts

**Preconditions:** Account frozen by ACCOUNT_MODERATOR_ROLE holder. Frozen status verifiable via `isFrozen(address)`.

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | FRZ-01 | Frozen account cannot create wager | 1. Connect frozen account 2. Attempt to create wager | Error: "AccountFrozenError"; creation blocked |  |
| [ ] | FRZ-02 | Frozen account cannot accept wager | 1. Frozen account is opponent on pending wager 2. Attempt to accept | Error: "AccountFrozenError" |  |
| [ ] | FRZ-03 | Frozen account cannot cancel open wager | 1. Frozen creator 2. Attempt cancelOpen | Error: "AccountFrozenError" |  |
| [ ] | FRZ-04 | Frozen account cannot declare winner | 1. Frozen resolver 2. Attempt declareWinner | Error: "AccountFrozenError" |  |
| [ ] | FRZ-05 | Frozen account cannot claim payout | 1. Frozen winner 2. Attempt claimPayout | Error: "AccountFrozenError"; payout stays in escrow |  |
| [ ] | FRZ-06 | Frozen account cannot trigger refund | 1. Frozen caller 2. Attempt claimRefund | Error: "AccountFrozenError" (but non-frozen third party CAN trigger refund for frozen party) |  |
| [ ] | FRZ-07 | Non-frozen party can trigger refund for frozen counterpart | 1. Creator frozen 2. Active wager past resolveDeadline 3. Non-frozen third party calls claimRefund | Refund succeeds; stakes returned to original parties (including frozen creator) |  |
| [ ] | FRZ-08 | Frozen banner displayed in app | 1. Connect frozen account | In-product banner warns user their account is frozen; shows reason from AccountFrozen event |  |
| [ ] | FRZ-09 | Membership unaffected by freeze | 1. Freeze account with active membership 2. Check membership status | Tier and expiry remain intact; membership not revoked by freeze |  |
| [ ] | FRZ-10 | Unfreeze restores all operations | 1. Unfreeze account (ADM-10) 2. Attempt all blocked operations | All operations succeed normally after unfreeze |  |

---

## 19. Cross-Cutting: Paused Protocol

**Preconditions:** Protocol paused by GUARDIAN_ROLE holder (ADM-03).

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | PAU-01 | Cannot create wager while paused | 1. Protocol paused 2. Attempt to create wager | Transaction reverts; error indicates protocol is paused |  |
| [ ] | PAU-02 | Cannot accept wager while paused | 1. Protocol paused 2. Attempt to accept pending wager | Transaction reverts |  |
| [ ] | PAU-03 | Cannot resolve wager while paused | 1. Protocol paused 2. Attempt declareWinner | Transaction reverts |  |
| [ ] | PAU-04 | Cannot claim payout while paused | 1. Protocol paused 2. Winner attempts claimPayout | Transaction reverts |  |
| [ ] | PAU-05 | Cannot trigger refund while paused | 1. Protocol paused 2. Attempt claimRefund | Transaction reverts |  |
| [ ] | PAU-06 | View functions still work while paused | 1. Protocol paused 2. Browse dashboard, view wager details, check balances | All read operations succeed; data displayed correctly |  |
| [ ] | PAU-07 | Unpause restores all operations | 1. Unpause protocol (ADM-04) 2. Retry blocked operations | All operations succeed normally |  |

---

## 20. Cross-Cutting: Expired Membership

**Preconditions:** Wallet with membership that has expired (> 30 days since purchase).

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | EXP-01 | Cannot create wager with expired membership | 1. Membership expired 2. Attempt to create wager | Error: "MembershipDenied" or "MembershipRequired"; CTA to renew |  |
| [ ] | EXP-02 | Can still claim payout with expired membership | 1. Membership expired 2. Resolved wager where user is winner 3. Claim payout | Claim succeeds; membership not required for claiming |  |
| [ ] | EXP-03 | Can still receive refund with expired membership | 1. Membership expired 2. Wager eligible for refund 3. Trigger refund | Refund succeeds; membership not required |  |
| [ ] | EXP-04 | Active wagers continue despite expiry | 1. Membership expires while wagers are Active 2. Check wager status | Active wagers remain active; can be resolved normally; settle/claim works |  |
| [ ] | EXP-05 | Renew expired membership | 1. Membership expired 2. Purchase same tier (extend) or new tier | Membership re-activated; new 30-day window; monthly counter reset |  |

---

## 21. Cross-Cutting: Network & Transaction Errors

**Preconditions:** Wallet connected.

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | NET-01 | Transaction confirmation feedback | 1. Submit any transaction (create, accept, resolve, claim) | TransactionProgress component shows steps: Verify > Approve > Execute > Complete; progress indicator visible |  |
| [ ] | NET-02 | Block explorer link for transaction | 1. Submit transaction 2. Transaction confirms | Link to Polygonscan (Amoy) for the transaction hash displayed |  |
| [ ] | NET-03 | Failed transaction handling | 1. Submit transaction that will revert (e.g., insufficient gas) | Error message displayed with reason; retry/cancel options; no funds lost (beyond gas) |  |
| [ ] | NET-04 | Pending transaction recovery | 1. Submit transaction 2. Transaction is pending (slow confirmation) 3. Refresh page | Pending transaction recovery banner shown; option to retry or cancel |  |
| [ ] | NET-05 | Network switch mid-transaction | 1. Begin transaction flow 2. Switch network in MetaMask during flow | Transaction fails gracefully; network error banner appears; no corrupt state |  |
| [ ] | NET-06 | Gas estimation display | 1. Review any transaction before confirming | Gas costs / speed options shown in MetaMask confirmation |  |

---

## 22. Accessibility & UI

**Preconditions:** FairWins app running in browser.

| | ID | Test Case | Steps | Expected Result | Tester Notes |
|---|---|---|---|---|---|
| [ ] | A11Y-01 | Dark/light theme toggle | 1. Click theme toggle in header 2. Switch between dark and light mode | Theme changes; all text readable; no contrast issues; persists across refresh |  |
| [ ] | A11Y-02 | Responsive layout (mobile) | 1. Open app on mobile device or resize browser to mobile width | Layout adapts; navigation accessible via kebab menu; all features reachable |  |
| [ ] | A11Y-03 | Responsive layout (tablet) | 1. Resize to tablet width | Layout adjusts appropriately; no overflow or clipping |  |
| [ ] | A11Y-04 | Modal accessibility | 1. Open any modal (wager creation, My Wagers, share, etc.) 2. Test: backdrop click dismisses, Escape key closes | Modal behaves correctly; focus trapped within modal; close mechanisms work |  |
| [ ] | A11Y-05 | Toast notifications | 1. Trigger various actions (success, error) | Toast notifications appear with correct type (success/error/info/warning); auto-dismiss after ~5 seconds; accessible role=alert |  |
| [ ] | A11Y-06 | Form validation feedback | 1. Submit wager creation form with invalid data | Inline validation messages shown for: empty fields, invalid addresses, out-of-range stakes, invalid dates |  |
| [ ] | A11Y-07 | Keyboard navigation | 1. Navigate app using Tab, Enter, Escape only | All interactive elements reachable and operable via keyboard |  |
| [ ] | A11Y-08 | Screen reader announcements | 1. Use screen reader 2. Perform key actions | ARIA live region announces important state changes |  |
| [ ] | A11Y-09 | Error boundary (component crash) | 1. Trigger a component error (if reproducible) | Fallback UI rendered; app does not white-screen; recovery option available |  |
| [ ] | A11Y-10 | Timezone handling for deadlines | 1. Create wager 2. Verify acceptance deadline and end date display | Dates show in user's local timezone; no off-by-one errors; countdown timers accurate |  |
| [ ] | A11Y-11 | Scrolling behavior | 1. Navigate long lists (My Wagers with many items) 2. Scroll through dashboard | Smooth scrolling; header behavior correct on scroll (sticky/hide); no layout jumps |  |

---

## End-to-End Lifecycle Scenarios

These scenarios combine multiple sections above into full lifecycle tests. They validate that the entire flow works as a connected journey, not just individual steps.

### E2E-01: Happy Path - 1v1 USDC Wager (Manual Resolution)

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | Creator connects wallet | WAL-01 |
| 2 | Creator purchases Bronze membership | MEM-01 |
| 3 | Creator registers encryption key | ENC-02 |
| 4 | Creator creates 1v1 wager (10 USDC, "Me" settler, encrypted) | CRE-01, CRE-07 |
| 5 | Creator shares QR code with opponent | SHR-01 |
| 6 | Opponent scans QR, connects wallet, decrypts, accepts | ACC-01, ACC-03 |
| 7 | Wager end date passes, status = Pending Resolution | RES-01 |
| 8 | Creator proposes resolution (creator wins) | RES-01 |
| 9 | 24-hour challenge period passes, no challenge | RES-06 |
| 10 | Creator claims 20 USDC payout | CLM-01 |

### E2E-02: Happy Path - Polymarket Auto-Resolved Wager

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | Creator creates Polymarket-pegged wager, selects market and YES side | CRE-12 |
| 2 | Opponent accepts wager | ACC-01 |
| 3 | Polymarket market resolves to YES | ORC-01 |
| 4 | Anyone calls autoResolveFromPolymarket | ORC-06 |
| 5 | Creator (who chose YES) is winner, claims payout | CLM-01 |

### E2E-03: Unhappy Path - Acceptance Timeout Refund

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | Creator creates wager with 48-hour acceptance deadline | CRE-01 |
| 2 | Opponent never accepts | - |
| 3 | 48+ hours pass | - |
| 4 | Creator (or anyone) calls claimRefund | REF-01 |
| 5 | Creator receives stake back | REF-01 |

### E2E-04: Unhappy Path - Challenged Resolution

The **A Friend** (Third Party) settler is offered again (Spec Kit 005 — arbitrators
now discover the wagers they oversee via the WagerRegistry per-user index), so the
arbitrated challenge flow is testable end-to-end.

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | Creator creates a 1v1 wager with the **A Friend** settler, naming an arbitrator | CRE-06 |
| 2 | Opponent accepts | ACC-01 |
| 3 | End date passes; creator proposes a resolution | RES-01 |
| 4 | Opponent disagrees and challenges within the 24h window | CHL-01 |
| 5 | Arbitrator reviews and resolves the dispute with the correct outcome | CHL-02 |
| 6 | Winner claims the payout | CLM-01 |

### E2E-05: Unhappy Path - Oracle Timeout

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | Creator creates Chainlink-pegged wager | CRE-13 |
| 2 | Opponent accepts | ACC-01 |
| 3 | Oracle never resolves (30+ days pass) | - |
| 4 | Either party triggers refund | ORC-12, REF-04 |
| 5 | Both parties receive original stakes back | REF-04 |

### E2E-06: Unhappy Path - Frozen Winner

| Step | Action | Reference Tests |
|------|--------|-----------------|
| 1 | 1v1 wager resolves, creator is winner | RES-01 |
| 2 | Admin freezes creator's account | ADM-09 |
| 3 | Creator attempts to claim, blocked | FRZ-05 |
| 4 | Admin unfreezes creator | ADM-10 |
| 5 | Creator claims payout successfully | FRZ-10, CLM-01 |

---

## Test Summary

| Section | Happy Path | Non-Happy Path | Total |
|---------|-----------|----------------|-------|
| 1. Wallet Connection & Network | 6 | 5 | 11 |
| 2. Membership & Tiers | 8 | 5 | 13 |
| 3. Encryption & Key Registration | 5 | 2 | 7 |
| 4. Wager Creation | 16 | 14 | 30 |
| 5. Wager Acceptance | 6 | 7 | 13 |
| 6. Wager Decline & Cancellation | 2 | 4 | 6 |
| 7. Manual Resolution | 6 | 8 | 14 |
| 8. Oracle Resolution | 6 | 6 | 12 |
| 9. Challenge & Dispute | 2 | 3 | 5 |
| 10. Claim Winnings & Payouts | 5 | 5 | 10 |
| 11. Refund & Timeout Flows | 4 | 4 | 8 |
| 12. Sharing (QR Code & Link) | 5 | 3 | 8 |
| 13. Dashboard & Wager Management | 10 | 3 | 13 |
| 14. Demo Mode | 6 | 1 | 7 |
| 15. Admin Panel | 13 | 4 | 17 |
| 16. Privacy & Encryption (E2E) | 5 | 2 | 7 |
| 17. Onboarding & Tutorial | 7 | 1 | 8 |
| 18. Cross-Cutting: Frozen Accounts | - | - | 10 |
| 19. Cross-Cutting: Paused Protocol | - | - | 7 |
| 20. Cross-Cutting: Expired Membership | - | - | 5 |
| 21. Cross-Cutting: Network & Tx Errors | - | - | 6 |
| 22. Accessibility & UI | - | - | 11 |
| **End-to-End Scenarios** | - | - | **6** |
| **Total** | | | **~234** |
