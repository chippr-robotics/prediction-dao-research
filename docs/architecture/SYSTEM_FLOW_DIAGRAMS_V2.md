# FairWins P2P Wager System - Flow Diagrams V2 (With Fixes)

## Overview

This document contains the updated system flow diagrams incorporating all recommended fixes:
1. ✅ claimWinnings() function
2. ✅ Challenge period for disputes
3. ✅ Claim timeout with treasury fallback
4. ✅ Oracle timeout fallback
5. ✅ Arbitrator fee mechanism

---

## Updated Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ WAGER : creates
    USER ||--o{ WAGER : accepts
    USER ||--o{ WAGER : arbitrates
    USER ||--o{ ACCEPTANCE_RECORD : has
    WAGER ||--|| ACCEPTANCE_RECORD : tracks
    WAGER ||--o| PENDING_RESOLUTION : has
    WAGER ||--o| ORACLE_ADAPTER : resolves_via
    WAGER }|--|| STAKE_TOKEN : uses
    ORACLE_REGISTRY ||--o{ ORACLE_ADAPTER : contains
    ORACLE_ADAPTER ||--o{ EXTERNAL_CONDITION : queries
    TREASURY ||--o{ WAGER : receives_unclaimed

    USER {
        address wallet PK
        uint256 totalWagered
        uint256 totalWon
        uint256 totalLost
        uint256 winCount
        uint256 lossCount
        uint256 arbitratorFeesEarned
    }

    WAGER {
        uint256 wagerId PK
        address creator FK
        address opponent FK
        address arbitrator FK
        uint256 creatorStake
        uint256 opponentStake
        address stakeToken FK
        string description
        bytes32 oracleId FK
        bytes32 externalCondition
        enum status
        enum resolutionType
        uint256 acceptanceDeadline
        uint256 expectedResolutionTime
        uint256 createdAt
        uint256 resolvedAt
        bool outcome
        address winner
        bool claimed
        uint256 arbitratorFeeBps
    }

    PENDING_RESOLUTION {
        uint256 wagerId FK
        bool proposedOutcome
        address proposer
        uint256 proposedAt
        uint256 challengeDeadline
        bool challenged
        address challenger
        uint256 challengeBond
    }

    ACCEPTANCE_RECORD {
        uint256 wagerId FK
        address participant FK
        uint256 stakedAmount
        uint256 acceptedAt
        bool hasAccepted
        bool isArbitrator
    }

    ORACLE_ADAPTER {
        bytes32 oracleId PK
        string name
        string oracleType
        address adapterAddress
        bool isVerified
    }

    EXTERNAL_CONDITION {
        bytes32 conditionId PK
        bytes32 oracleId FK
        bool resolved
        uint256 passNumerator
        uint256 failNumerator
        uint256 resolvedAt
    }

    STAKE_TOKEN {
        address tokenAddress PK
        string symbol
        uint8 decimals
        bool accepted
    }

    TREASURY {
        address treasuryAddress PK
        uint256 totalSwept
    }
```

---

## Updated State Machine (Complete)

```mermaid
stateDiagram-v2
    [*] --> Pending : createWager()

    state Pending {
        [*] --> AwaitingAcceptance
        AwaitingAcceptance --> AwaitingAcceptance : acceptWager() [threshold not met]
    }

    Pending --> Active : acceptWager() [threshold met]
    Pending --> Cancelled : cancelWager() [by creator]
    Pending --> Refunded : processExpiredDeadline() [threshold not met]

    state Active {
        [*] --> AwaitingResolution
        AwaitingResolution --> AwaitingResolution : [monitoring oracle]
    }

    Active --> PendingResolution : proposeResolution() [manual types]
    Active --> Resolved : resolveFromOracle() [external oracle resolved]
    Active --> OracleTimedOut : triggerOracleTimeout() [30+ days past expected]

    state PendingResolution {
        [*] --> ChallengeWindow
        ChallengeWindow --> ChallengeWindow : [24h countdown]
    }

    PendingResolution --> Challenged : challengeResolution() [within 24h + bond]
    PendingResolution --> Resolved : finalizeResolution() [24h passed, no challenge]

    state Challenged {
        [*] --> AwaitingArbitration
        AwaitingArbitration --> AwaitingArbitration : [arbitrator reviewing]
    }

    Challenged --> Resolved : resolveDispute() [arbitrator decides]

    state OracleTimedOut {
        [*] --> AwaitingAction
        AwaitingAction --> MutualRefundPending : acceptMutualRefund() [one party]
        MutualRefundPending --> MutualRefundPending : [waiting for other party]
    }

    OracleTimedOut --> Refunded : acceptMutualRefund() [both parties agree]
    OracleTimedOut --> Resolved : forceManualResolution() [arbitrator]

    state Resolved {
        [*] --> AwaitingClaim
        AwaitingClaim --> AwaitingClaim : [90 day countdown]
    }

    Resolved --> Claimed : claimWinnings() [winner claims]
    Resolved --> Swept : sweepUnclaimedFunds() [90+ days, to treasury]

    Claimed --> [*]
    Swept --> [*]
    Cancelled --> [*]
    Refunded --> [*]

    note right of PendingResolution
        24-hour challenge window
        Either party can challenge
        with bond deposit
    end note

    note right of OracleTimedOut
        30 days past expected
        resolution time
    end note

    note right of Resolved
        90-day claim window
        After that, treasury sweeps
    end note
```

---

## User Flows (Updated)

### Flow 1: Create Wager (Complete)

```mermaid
flowchart TD
    Start([User Opens App]) --> Dashboard[View Dashboard]
    Dashboard --> CreateBtn[Click "Create Wager"]

    CreateBtn --> DescForm[Enter Wager Description]
    DescForm --> ResChoice{Choose Resolution<br/>Method}

    ResChoice -->|Find Existing| SearchMarket[Search External Markets]
    ResChoice -->|Price Oracle| SelectChainlink[Select Chainlink Feed]
    ResChoice -->|Manual| SelectResolver[Choose Who Resolves]
    ResChoice -->|Arbitrator| EnterArb[Enter Arbitrator Address]

    SearchMarket --> SelectCondition[Select Market/Condition]
    SelectCondition --> SetExpectedTime[Set Expected Resolution Time]
    SetExpectedTime --> Stakes

    SelectChainlink --> ConfigThreshold[Set Price Threshold & Date]
    ConfigThreshold --> Stakes

    SelectResolver --> Stakes[Set Stake Amount]
    EnterArb --> SetArbFee[Set Arbitrator Fee %]
    SetArbFee --> Stakes

    Stakes --> Token[Select Payment Token]
    Token --> Odds{Equal Stakes?}
    Odds -->|Yes| Equal[1:1 Odds]
    Odds -->|No| Custom[Set Custom Odds]
    Equal --> Opponent
    Custom --> Opponent

    Opponent[Enter Opponent Address] --> Deadline[Set Acceptance Deadline]
    Deadline --> Review[Review All Terms]

    Review --> Confirm{Confirm?}
    Confirm -->|No| Edit[Edit Terms]
    Edit --> DescForm

    Confirm -->|Yes| ApproveToken{ERC20?}
    ApproveToken -->|Yes| Approve[Approve Token Spend]
    ApproveToken -->|No| Submit

    Approve --> Submit[Submit Transaction]
    Submit --> TxStatus{Status?}

    TxStatus -->|Failed| Error[Show Error]
    Error --> Review

    TxStatus -->|Success| Created[Wager Created!]
    Created --> SharePrompt{Share?}

    SharePrompt -->|Twitter| Twitter[Open Twitter]
    SharePrompt -->|Discord| Discord[Copy Embed]
    SharePrompt -->|Telegram| Telegram[Open Telegram]
    SharePrompt -->|Link| CopyLink[Copy Link]
    SharePrompt -->|Skip| Done

    Twitter --> Done[Return to Dashboard]
    Discord --> Done
    Telegram --> Done
    CopyLink --> Done
```

### Flow 2: Accept Wager (Complete)

```mermaid
flowchart TD
    Start([Receive Invitation]) --> Source{Source?}

    Source -->|Social Link| ClickLink[Click Link]
    Source -->|App Notification| OpenApp[Open App]
    Source -->|QR Code| ScanQR[Scan QR]

    ClickLink --> DeepLink[Deep Link Handler]
    ScanQR --> DeepLink
    OpenApp --> InviteList[View Pending Invitations]
    InviteList --> SelectInvite[Select Wager]

    DeepLink --> ViewDetails[View Wager Details]
    SelectInvite --> ViewDetails

    ViewDetails --> CheckDeadline{Deadline<br/>Passed?}
    CheckDeadline -->|Yes| Expired[Show Expired]
    Expired --> End([End])

    CheckDeadline -->|No| CheckMembership{Has<br/>Membership?}
    CheckMembership -->|No| Purchase[Purchase Tier]
    Purchase --> CheckMembership

    CheckMembership -->|Yes| CheckFunds{Sufficient<br/>Funds?}
    CheckFunds -->|No| AddFunds[Add Funds]
    AddFunds --> CheckFunds

    CheckFunds -->|Yes| ReviewTerms[Review Terms]
    ReviewTerms --> Decision{Decision?}

    Decision -->|Decline| Decline[Decline]
    Decline --> End

    Decision -->|Counter| Counter[Create Counter-offer]
    Counter --> End

    Decision -->|Accept| AcceptFlow[Begin Accept Flow]

    AcceptFlow --> ApproveToken{ERC20?}
    ApproveToken -->|Yes| Approve[Approve Spend]
    ApproveToken -->|No| SignAccept

    Approve --> SignAccept[Sign Accept Tx]
    SignAccept --> TxStatus{Status?}

    TxStatus -->|Failed| TxError[Show Error]
    TxError --> ReviewTerms

    TxStatus -->|Success| CheckThreshold{Threshold<br/>Met?}

    CheckThreshold -->|No| ShowPending[Show Pending Status]
    ShowPending --> End

    CheckThreshold -->|Yes| Activated[Wager Activated!]
    Activated --> ViewActive[View in Active Wagers]
    ViewActive --> End
```

### Flow 3: Manual Resolution (With Challenge Period)

```mermaid
flowchart TD
    Start([Wager Active]) --> CheckType{Resolution<br/>Type?}

    CheckType -->|External Oracle| OracleFlow[Oracle Resolution Flow]
    CheckType -->|Manual| ManualFlow[Manual Resolution Flow]

    subgraph ManualResolution[Manual Resolution Flow]
        ManualFlow --> CheckAuth{Authorized<br/>Resolver?}
        CheckAuth -->|No| Reject[Revert: NotAuthorized]

        CheckAuth -->|Yes| ProposeOutcome[Propose Outcome]
        ProposeOutcome --> SetDeadline[Set 24h Challenge Deadline]
        SetDeadline --> EmitProposed[Emit ResolutionProposed]
        EmitProposed --> WaitPeriod[Wait Challenge Period]

        WaitPeriod --> Challenged{Challenged?}

        Challenged -->|Yes| RecordChallenge[Record Challenge + Bond]
        RecordChallenge --> NotifyArb[Notify Arbitrator]
        NotifyArb --> ArbReview[Arbitrator Reviews]
        ArbReview --> ArbDecision[Arbitrator Decides]
        ArbDecision --> DistributeBonds[Distribute Bonds]
        DistributeBonds --> SetResolved

        Challenged -->|No, 24h passed| Finalize[Finalize Resolution]
        Finalize --> SetResolved[Set Status = Resolved]
    end

    subgraph OracleResolution[Oracle Resolution Flow]
        OracleFlow --> CheckOracleResolved{Oracle<br/>Resolved?}

        CheckOracleResolved -->|No| CheckTimeout{30+ Days<br/>Past Expected?}
        CheckTimeout -->|No| WaitOracle[Wait for Oracle]
        WaitOracle --> CheckOracleResolved

        CheckTimeout -->|Yes| TriggerTimeout[Trigger Oracle Timeout]
        TriggerTimeout --> TimeoutFlow[Oracle Timeout Flow]

        CheckOracleResolved -->|Yes| FetchOutcome[Fetch Outcome]
        FetchOutcome --> SetResolved
    end

    SetResolved --> EnableClaim[Enable Claim]
    EnableClaim --> End([Wager Resolved])
```

### Flow 4: Oracle Timeout Handling

```mermaid
flowchart TD
    Start([Oracle Timed Out]) --> Status[Status = OracleTimedOut]

    Status --> Options{Resolution<br/>Path?}

    Options -->|Mutual Refund| RefundPath[Mutual Refund Path]
    Options -->|Arbitrator| ArbPath[Arbitrator Path]

    subgraph MutualRefund[Mutual Refund Path]
        RefundPath --> Party1[First Party Accepts]
        Party1 --> RecordAccept1[Record Acceptance]
        RecordAccept1 --> WaitParty2[Wait for Other Party]

        WaitParty2 --> Party2{Other Party<br/>Accepts?}
        Party2 -->|No| Stalemate[Stalemate - Need Arbitrator]
        Stalemate --> ArbPath

        Party2 -->|Yes| BothAccepted[Both Accepted]
        BothAccepted --> RefundBoth[Refund Both Stakes]
        RefundBoth --> SetRefunded[Status = Refunded]
    end

    subgraph ArbitratorResolution[Arbitrator Resolution]
        ArbPath --> CheckArb{Has<br/>Arbitrator?}
        CheckArb -->|No| NeedArb[Stuck - Contact Support]

        CheckArb -->|Yes| ArbForce[Arbitrator Forces Resolution]
        ArbForce --> SetOutcome[Set Outcome]
        SetOutcome --> SetResolved[Status = Resolved]
    end

    SetRefunded --> End([Complete])
    SetResolved --> End
    NeedArb --> End
```

### Flow 5: Claim Winnings (With Timeout)

```mermaid
flowchart TD
    Start([Wager Resolved]) --> CheckWinner{Is User<br/>Winner?}

    CheckWinner -->|No| NoAction[No Claim Available]
    NoAction --> End([End])

    CheckWinner -->|Yes| CheckClaimed{Already<br/>Claimed?}
    CheckClaimed -->|Yes| AlreadyClaimed[Already Claimed]
    AlreadyClaimed --> End

    CheckClaimed -->|No| CheckTimeout{Within 90<br/>Days?}

    CheckTimeout -->|No| Expired[Claim Period Expired]
    Expired --> SweepAvailable[Sweep Available for Treasury]
    SweepAvailable --> End

    CheckTimeout -->|Yes| ShowClaim[Show Claim Button]
    ShowClaim --> ClickClaim[Click Claim]
    ClickClaim --> SignTx[Sign Transaction]

    SignTx --> TxStatus{Status?}
    TxStatus -->|Failed| Error[Show Error]
    Error --> ShowClaim

    TxStatus -->|Success| CalcPayout[Calculate Payout]

    CalcPayout --> CheckArbFee{Arbitrator<br/>Fee?}
    CheckArbFee -->|Yes| PayArb[Pay Arbitrator Fee]
    PayArb --> PayWinner
    CheckArbFee -->|No| PayWinner[Pay Winner]

    PayWinner --> MarkClaimed[Mark as Claimed]
    MarkClaimed --> EmitEvent[Emit WinningsClaimed]
    EmitEvent --> ShowSuccess[Show Success]
    ShowSuccess --> End
```

### Flow 6: Treasury Sweep (Unclaimed Funds)

```mermaid
flowchart TD
    Start([Check Resolved Wagers]) --> FindUnclaimed[Find Unclaimed > 90 Days]

    FindUnclaimed --> HasUnclaimed{Any<br/>Unclaimed?}
    HasUnclaimed -->|No| Done[Nothing to Sweep]
    Done --> End([End])

    HasUnclaimed -->|Yes| ForEach[For Each Unclaimed Wager]

    ForEach --> CheckTime{resolvedAt +<br/>90 days < now?}
    CheckTime -->|No| Skip[Skip - Not Yet]
    Skip --> ForEach

    CheckTime -->|Yes| CalcAmount[Calculate Total Stakes]
    CalcAmount --> TransferTreasury[Transfer to Treasury]
    TransferTreasury --> MarkSwept[Mark as Swept]
    MarkSwept --> EmitEvent[Emit UnclaimedFundsSwept]
    EmitEvent --> ForEach

    ForEach --> Complete[All Processed]
    Complete --> End
```

---

## Sequence Diagrams (Updated)

### Sequence 1: Complete Wager Lifecycle (With All Fixes)

```mermaid
sequenceDiagram
    autonumber
    participant Creator
    participant UI as Frontend
    participant Factory as P2PWagerFactory
    participant Token as StakeToken
    participant Oracle as OracleRegistry
    participant Opponent
    participant Arbitrator
    participant Treasury
    participant Indexer as Subgraph

    Note over Creator, Indexer: PHASE 1: Creation

    Creator->>UI: Create new wager
    UI->>UI: Validate inputs
    Creator->>Factory: createWager(opponent, stake, oracleId, arbFee, ...)

    alt ERC20 Stake
        Creator->>Token: approve(factory, amount)
        Factory->>Token: transferFrom(creator, factory, amount)
    else Native Token
        Creator->>Factory: Send ETH with transaction
    end

    Factory->>Factory: Store wager, status=Pending
    Factory-->>Creator: Emit WagerCreated
    Indexer->>Factory: Index event

    Note over Creator, Indexer: PHASE 2: Acceptance

    Creator->>UI: Share to Twitter
    UI->>UI: Generate share intent
    Opponent->>UI: Click shared link
    UI->>Factory: getWagerDetails(wagerId)
    Factory-->>UI: Return details

    Opponent->>Factory: acceptWager(wagerId) + stake
    Factory->>Factory: Check threshold
    Factory->>Factory: status = Active
    Factory-->>Opponent: Emit WagerActivated
    Indexer->>Factory: Index event

    Note over Creator, Indexer: PHASE 3a: Oracle Resolution Path

    rect rgb(200, 230, 200)
        Note right of Oracle: Oracle resolves externally
        Creator->>Factory: resolveFromOracle(wagerId)
        Factory->>Oracle: getOutcome(oracleId, conditionId)
        Oracle-->>Factory: (outcome, confidence)
        Factory->>Factory: status = Resolved, winner set
        Factory-->>Creator: Emit WagerResolved
    end

    Note over Creator, Indexer: PHASE 3b: Manual Resolution Path

    rect rgb(230, 230, 200)
        Creator->>Factory: proposeResolution(wagerId, true)
        Factory->>Factory: status = PendingResolution
        Factory->>Factory: challengeDeadline = now + 24h
        Factory-->>Creator: Emit ResolutionProposed

        alt Opponent Challenges
            Opponent->>Factory: challengeResolution(wagerId) + bond
            Factory->>Factory: status = Challenged
            Factory-->>Opponent: Emit ResolutionChallenged

            Arbitrator->>Factory: resolveDispute(wagerId, outcome)
            Factory->>Factory: Distribute bonds
            Factory->>Factory: status = Resolved
            Factory-->>Arbitrator: Emit DisputeResolved
        else No Challenge
            Note over Factory: 24 hours pass
            Creator->>Factory: finalizeResolution(wagerId)
            Factory->>Factory: status = Resolved
            Factory-->>Creator: Emit ResolutionFinalized
        end
    end

    Note over Creator, Indexer: PHASE 4: Claim

    Creator->>Factory: claimWinnings(wagerId)
    Factory->>Factory: Verify winner, not claimed, within 90 days

    alt Has Arbitrator Fee
        Factory->>Factory: Calculate fee
        Factory->>Arbitrator: Transfer arbitrator fee
        Factory-->>Factory: Emit ArbitratorPaid
    end

    Factory->>Creator: Transfer winnings
    Factory->>Factory: Mark claimed
    Factory-->>Creator: Emit WinningsClaimed
    Indexer->>Factory: Index event

    Note over Creator, Indexer: PHASE 5: Timeout Paths

    rect rgb(255, 230, 230)
        Note over Factory: If winner doesn't claim within 90 days
        Treasury->>Factory: sweepUnclaimedFunds(wagerId)
        Factory->>Factory: Verify 90 days passed
        Factory->>Treasury: Transfer unclaimed funds
        Factory-->>Treasury: Emit UnclaimedFundsSwept
    end
```

### Sequence 2: Oracle Timeout Flow

```mermaid
sequenceDiagram
    autonumber
    participant Anyone
    participant Factory as P2PWagerFactory
    participant Creator
    participant Opponent
    participant Arbitrator
    participant Timer as Block.timestamp

    Note over Anyone, Timer: Oracle Never Resolves

    Anyone->>Factory: Check wager status
    Factory-->>Anyone: Active, expectedResolution passed

    Anyone->>Factory: triggerOracleTimeout(wagerId)
    Factory->>Factory: Verify expectedResolution + 30 days < now
    Factory->>Factory: status = OracleTimedOut
    Factory-->>Anyone: Emit OracleTimeoutTriggered

    alt Mutual Refund Path
        Creator->>Factory: acceptMutualRefund(wagerId)
        Factory->>Factory: Record creator acceptance
        Factory-->>Creator: Emit MutualRefundAccepted(creator)

        Opponent->>Factory: acceptMutualRefund(wagerId)
        Factory->>Factory: Both parties accepted
        Factory->>Factory: status = Refunded
        Factory->>Creator: Return creator stake
        Factory->>Opponent: Return opponent stake
        Factory-->>Opponent: Emit MutualRefundCompleted

    else Arbitrator Forces Resolution
        Note over Arbitrator: After reasonable waiting period

        Arbitrator->>Factory: forceManualResolution(wagerId, outcome)
        Factory->>Factory: Verify arbitrator authorized
        Factory->>Factory: Set winner based on outcome
        Factory->>Factory: status = Resolved
        Factory-->>Arbitrator: Emit ForcedResolution

        Note over Creator, Opponent: Normal claim flow follows
    end
```

### Sequence 3: Challenge and Dispute Flow

```mermaid
sequenceDiagram
    autonumber
    participant Proposer
    participant Factory as P2PWagerFactory
    participant Challenger
    participant Arbitrator
    participant Timer as Block.timestamp

    Note over Proposer, Timer: Resolution Proposed

    Proposer->>Factory: proposeResolution(wagerId, true)
    Factory->>Factory: Verify proposer authorized
    Factory->>Factory: status = PendingResolution
    Factory->>Factory: challengeDeadline = now + 24h
    Factory->>Factory: Store proposed outcome
    Factory-->>Proposer: Emit ResolutionProposed

    Note over Challenger: Within 24 hours

    Challenger->>Factory: challengeResolution(wagerId) + 0.1 ETH bond
    Factory->>Factory: Verify within challenge window
    Factory->>Factory: Verify challenger is other party
    Factory->>Factory: Store challenger bond
    Factory->>Factory: status = Challenged
    Factory-->>Challenger: Emit ResolutionChallenged

    Note over Arbitrator: Reviews evidence

    Arbitrator->>Factory: resolveDispute(wagerId, finalOutcome)
    Factory->>Factory: Verify arbitrator authorized

    alt Proposer was correct
        Factory->>Proposer: Return proposer's implicit bond
        Factory->>Proposer: Award challenger's bond
        Factory-->>Factory: Challenger loses bond
    else Challenger was correct
        Factory->>Challenger: Return challenger's bond
        Factory->>Challenger: Award proposer's implicit bond
        Factory-->>Factory: Proposer loses bond
    end

    Factory->>Factory: Set winner based on finalOutcome
    Factory->>Factory: status = Resolved
    Factory-->>Arbitrator: Emit DisputeResolved
```

---

## Error Handling (Complete)

### All Error States and Recovery

```mermaid
flowchart TD
    subgraph Creation[Creation Errors]
        C1[InvalidOpponent] --> C1R[Fix: Valid non-self address]
        C2[InvalidDescription] --> C2R[Fix: Add description]
        C3[InvalidDeadline] --> C3R[Fix: 1h-30d range]
        C4[InvalidStake] --> C4R[Fix: Non-zero stake]
        C5[InvalidOdds] --> C5R[Fix: Multiplier >= 200]
        C6[InvalidArbitratorFee] --> C6R[Fix: <= 10%]
        C7[MembershipRequired] --> C7R[Fix: Purchase tier]
        C8[InsufficientFunds] --> C8R[Fix: Add funds]
    end

    subgraph Acceptance[Acceptance Errors]
        A1[InvalidMarketId] --> A1R[Fix: Check wager exists]
        A2[DeadlinePassed] --> A2R[Info: Wager expired]
        A3[AlreadyAccepted] --> A3R[Info: Already accepted]
        A4[NotInvited] --> A4R[Info: Not participant]
        A5[InsufficientStake] --> A5R[Fix: Send correct amount]
    end

    subgraph Resolution[Resolution Errors]
        R1[NotActive] --> R1R[Info: Wrong status]
        R2[NotAuthorized] --> R2R[Fix: Use authorized account]
        R3[OracleNotResolved] --> R3R[Wait: Oracle pending]
        R4[ChallengeWindowActive] --> R4R[Wait: 24h not passed]
        R5[AlreadyChallenged] --> R5R[Info: Already challenged]
        R6[InsufficientBond] --> R6R[Fix: Send 0.1 ETH]
    end

    subgraph Claim[Claim Errors]
        CL1[NotResolved] --> CL1R[Wait: Resolution pending]
        CL2[NotWinner] --> CL2R[Info: Not winner]
        CL3[AlreadyClaimed] --> CL3R[Info: Already claimed]
        CL4[ClaimPeriodExpired] --> CL4R[Info: Funds swept]
    end

    subgraph Timeout[Timeout Errors]
        T1[NotTimedOut] --> T1R[Wait: 30 days not passed]
        T2[AlreadyResolved] --> T2R[Info: Already resolved]
        T3[RefundNotAccepted] --> T3R[Wait: Other party]
        T4[NoArbitrator] --> T4R[Stuck: Contact support]
    end
```

---

## Cross-Reference: Functions to States (Updated)

| Function | Required State | New State | Events | Bond/Fee |
|----------|---------------|-----------|--------|----------|
| `createWager` | N/A | Pending | WagerCreated | - |
| `acceptWager` | Pending | Active | WagerActivated | - |
| `cancelWager` | Pending | Cancelled | WagerCancelled | - |
| `proposeResolution` | Active | PendingResolution | ResolutionProposed | - |
| `challengeResolution` | PendingResolution | Challenged | ResolutionChallenged | 0.1 ETH bond |
| `finalizeResolution` | PendingResolution | Resolved | ResolutionFinalized | - |
| `resolveDispute` | Challenged | Resolved | DisputeResolved | Bond distributed |
| `resolveFromOracle` | Active | Resolved | WagerResolved | - |
| `triggerOracleTimeout` | Active | OracleTimedOut | OracleTimeoutTriggered | - |
| `acceptMutualRefund` | OracleTimedOut | OracleTimedOut/Refunded | MutualRefundAccepted/Completed | - |
| `forceManualResolution` | OracleTimedOut | Resolved | ForcedResolution | - |
| `claimWinnings` | Resolved | Resolved (claimed) | WinningsClaimed, ArbitratorPaid | Arb fee deducted |
| `sweepUnclaimedFunds` | Resolved (90d+) | Resolved (swept) | UnclaimedFundsSwept | - |

---

## Configuration Parameters

| Parameter | Default | Range | Modifiable By |
|-----------|---------|-------|---------------|
| `challengePeriod` | 24 hours | 1h - 7 days | Owner |
| `challengeBond` | 0.1 ETH | 0.01 - 1 ETH | Owner |
| `claimTimeout` | 90 days | 30 - 365 days | Owner |
| `oracleTimeout` | 30 days | 7 - 90 days | Owner |
| `maxArbitratorFee` | 1000 (10%) | 100 - 2000 | Owner |
| `treasury` | DAO address | Any address | Owner |

---

## Invariants (Must Always Hold)

```solidity
// 1. Stakes are always accounted for
totalStakes[token] == sum(activeWagers.stakes) + treasury.swept

// 2. Only one outcome possible
wager.resolved => (wager.winner == creator XOR wager.winner == opponent)

// 3. Challenge only in window
wager.challenged => block.timestamp <= wager.challengeDeadline

// 4. Claim only once
wager.claimed => claimWinnings() reverts

// 5. Timeout only after deadline
wager.status == OracleTimedOut =>
    block.timestamp > wager.expectedResolutionTime + oracleTimeout

// 6. Sweep only after claim period
swept[wagerId] =>
    block.timestamp > wager.resolvedAt + claimTimeout

// 7. Arbitrator fee within bounds
wager.arbitratorFeeBps <= maxArbitratorFee

// 8. Status transitions are valid (see state machine)
validTransition(oldStatus, newStatus)
```

---

## Summary of Changes from V1

| Issue | V1 Status | V2 Status |
|-------|-----------|-----------|
| claimWinnings() | ❌ Missing | ✅ Implemented |
| Challenge period | ❌ Missing | ✅ 24h window with bonds |
| Claim timeout | ❌ Missing | ✅ 90 days + treasury sweep |
| Oracle fallback | ❌ Missing | ✅ 30 day timeout + mutual refund |
| Arbitrator fees | ❌ Missing | ✅ Configurable % |
| State machine | Incomplete | Complete with all transitions |
| Error handling | Partial | Comprehensive |
