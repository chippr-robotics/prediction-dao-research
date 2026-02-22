# FairWins P2P Wager System - Flow Diagrams

## Table of Contents
1. [System Overview](#system-overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Wager State Machine](#wager-state-machine)
4. [User Flows](#user-flows)
5. [Sequence Diagrams](#sequence-diagrams)
6. [Error Handling Paths](#error-handling-paths)
7. [Consistency Analysis](#consistency-analysis)

---

## System Overview

```mermaid
graph TB
    subgraph "External Platforms"
        Twitter[Twitter/X]
        Discord[Discord]
        Telegram[Telegram]
        Polymarket[Polymarket CTF]
        Chainlink[Chainlink Feeds]
        UMA[UMA Oracle]
    end

    subgraph "FairWins Core"
        UI[Frontend Dashboard]
        Wager[P2P Wager Factory]
        Oracle[Oracle Registry]
        Subgraph[The Graph Indexer]
    end

    subgraph "User Actions"
        Create[Create Wager]
        Accept[Accept Wager]
        Resolve[Resolve Wager]
        Claim[Claim Winnings]
    end

    UI --> Create
    UI --> Accept
    UI --> Resolve
    UI --> Claim

    Create --> Wager
    Accept --> Wager
    Resolve --> Oracle
    Oracle --> Polymarket
    Oracle --> Chainlink
    Oracle --> UMA

    Wager --> Subgraph
    Subgraph --> UI

    Create -.-> Twitter
    Create -.-> Discord
    Create -.-> Telegram
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ WAGER : creates
    USER ||--o{ WAGER : accepts
    USER ||--o{ ACCEPTANCE_RECORD : has
    WAGER ||--|| ACCEPTANCE_RECORD : tracks
    WAGER ||--o| ORACLE_ADAPTER : resolves_via
    WAGER }|--|| STAKE_TOKEN : uses
    ORACLE_REGISTRY ||--o{ ORACLE_ADAPTER : contains
    ORACLE_ADAPTER ||--o{ EXTERNAL_CONDITION : queries

    USER {
        address wallet PK
        uint256 totalWagered
        uint256 totalWon
        uint256 totalLost
        uint256 winCount
        uint256 lossCount
    }

    WAGER {
        uint256 wagerId PK
        address creator FK
        address opponent FK
        address arbitrator
        uint256 creatorStake
        uint256 opponentStake
        address stakeToken FK
        string description
        bytes32 oracleId FK
        bytes32 externalCondition
        enum status
        enum resolutionType
        uint256 acceptanceDeadline
        uint256 createdAt
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
        address adapterAddress
        bool isVerified
    }

    EXTERNAL_CONDITION {
        bytes32 conditionId PK
        bytes32 oracleId FK
        bool resolved
        uint256 passNumerator
        uint256 failNumerator
    }

    STAKE_TOKEN {
        address tokenAddress PK
        string symbol
        uint8 decimals
    }

    ORACLE_REGISTRY {
        address registryAddress PK
        address owner
    }
```

---

## Wager State Machine

### Primary State Transitions

```mermaid
stateDiagram-v2
    [*] --> PendingAcceptance : createWager()

    PendingAcceptance --> Active : acceptWager() [threshold met]
    PendingAcceptance --> Cancelled : cancelPendingWager() [by creator]
    PendingAcceptance --> Refunded : processExpiredDeadline() [deadline passed, threshold not met]
    PendingAcceptance --> PendingAcceptance : acceptWager() [threshold not yet met]

    Active --> Resolved : resolveManually() [authorized resolver]
    Active --> Resolved : resolveFromOracle() [oracle resolved]
    Active --> Disputed : disputeResolution() [challenge filed]

    Disputed --> Resolved : escalationComplete() [arbitration decides]
    Disputed --> Active : disputeRejected() [challenge failed]

    Resolved --> [*] : claimWinnings() [funds distributed]
    Cancelled --> [*] : [stakes refunded automatically]
    Refunded --> [*] : [stakes refunded automatically]

    note right of PendingAcceptance
        Waiting for opponent
        and/or arbitrator
        to accept invitation
    end note

    note right of Active
        Both parties staked
        Awaiting outcome
    end note

    note right of Disputed
        Resolution challenged
        In arbitration
    end note
```

### Resolution Type State Branches

```mermaid
stateDiagram-v2
    state ResolutionType {
        [*] --> Either
        [*] --> Initiator
        [*] --> Receiver
        [*] --> ThirdParty
        [*] --> AutoPegged
        [*] --> PolymarketOracle
    }

    state Either {
        e1: Creator OR Opponent can resolve
    }

    state Initiator {
        i1: Only Creator can resolve
    }

    state Receiver {
        r1: Only Opponent can resolve
    }

    state ThirdParty {
        t1: Only Arbitrator can resolve
    }

    state AutoPegged {
        a1: Auto-resolves when linked
        a2: ConditionalMarket resolves
        a1 --> a2
    }

    state PolymarketOracle {
        p1: Auto-resolves when linked
        p2: Polymarket condition resolves
        p1 --> p2
    }
```

---

## User Flows

### Flow 1: Create Wager (1v1 Equal Stakes)

```mermaid
flowchart TD
    Start([User Opens App]) --> Dashboard[View Dashboard]
    Dashboard --> CreateBtn[Click "Create Wager"]
    CreateBtn --> DescForm[Enter Wager Description]

    DescForm --> ResChoice{Choose Resolution<br/>Method}

    ResChoice -->|Find Existing| Search[Search External Markets]
    ResChoice -->|Price Oracle| Oracle[Select Chainlink Feed]
    ResChoice -->|Manual| Manual[Choose Resolver Type]
    ResChoice -->|Arbitrator| Arb[Enter Arbitrator Address]

    Search --> SelectMarket[Select Polymarket/Kalshi Market]
    SelectMarket --> Stakes
    Oracle --> ConfigThreshold[Set Price Threshold]
    ConfigThreshold --> Stakes
    Manual --> Stakes
    Arb --> Stakes

    Stakes[Set Stake Amount] --> Token[Select Payment Token]
    Token --> Odds{Equal Stakes?}

    Odds -->|Yes| Equal[1:1 Odds]
    Odds -->|No| Custom[Set Custom Odds Multiplier]

    Equal --> Opponent
    Custom --> Opponent

    Opponent[Enter Opponent Address<br/>or Create Open Wager] --> Deadline[Set Acceptance Deadline]

    Deadline --> Review[Review Wager Terms]
    Review --> Confirm{Confirm &<br/>Sign Transaction?}

    Confirm -->|Yes| Submit[Submit to Blockchain]
    Confirm -->|No| Edit[Edit Terms]
    Edit --> DescForm

    Submit --> TxPending{Transaction<br/>Status?}

    TxPending -->|Success| Created[Wager Created]
    TxPending -->|Failed| Error[Show Error]
    Error --> Review

    Created --> Share{Share Wager?}
    Share -->|Twitter| Twitter[Open Twitter Intent]
    Share -->|Discord| Discord[Copy Discord Embed]
    Share -->|Link| Link[Copy Shareable Link]
    Share -->|Skip| Dashboard2[Return to Dashboard]

    Twitter --> Dashboard2
    Discord --> Dashboard2
    Link --> Dashboard2
```

### Flow 2: Accept Wager Invitation

```mermaid
flowchart TD
    Start([User Receives Invitation]) --> Source{Invitation<br/>Source?}

    Source -->|Social Media Link| OpenLink[Click Link]
    Source -->|Direct Notification| OpenApp[Open App]
    Source -->|QR Code| ScanQR[Scan QR Code]

    OpenLink --> DeepLink[Deep Link to Wager]
    ScanQR --> DeepLink
    OpenApp --> Invitations[View Pending Invitations]
    Invitations --> SelectWager[Select Wager]

    DeepLink --> WagerDetails
    SelectWager --> WagerDetails

    WagerDetails[View Wager Details] --> CheckMembership{Has Required<br/>Membership?}

    CheckMembership -->|No| PurchaseTier[Purchase Membership Tier]
    PurchaseTier --> CheckMembership
    CheckMembership -->|Yes| CheckDeadline{Deadline<br/>Passed?}

    CheckDeadline -->|Yes| Expired[Show "Wager Expired"]
    Expired --> End([End])

    CheckDeadline -->|No| CheckFunds{Sufficient<br/>Funds?}

    CheckFunds -->|No| AddFunds[Add Funds / Swap]
    AddFunds --> CheckFunds

    CheckFunds -->|Yes| ReviewTerms[Review Wager Terms]

    ReviewTerms --> Decision{Accept or<br/>Decline?}

    Decision -->|Decline| Decline[Decline Invitation]
    Decline --> End

    Decision -->|Counter| Counter[Propose Counter-terms]
    Counter --> NewWager[Create New Wager<br/>with Modified Terms]
    NewWager --> End

    Decision -->|Accept| Approve[Approve Token Spend<br/>if ERC20]

    Approve --> SignAccept[Sign Accept Transaction]

    SignAccept --> TxStatus{Transaction<br/>Status?}

    TxStatus -->|Success| CheckThreshold{Threshold<br/>Met?}
    TxStatus -->|Failed| Error[Show Error]
    Error --> ReviewTerms

    CheckThreshold -->|Yes| Activated[Wager Activated!]
    CheckThreshold -->|No| Pending[Waiting for<br/>Other Participants]

    Activated --> ViewActive[View in Active Wagers]
    Pending --> ViewPending[View in Pending]

    ViewActive --> End
    ViewPending --> End
```

### Flow 3: Resolve Wager

```mermaid
flowchart TD
    Start([Resolution Triggered]) --> Type{Resolution<br/>Type?}

    Type -->|Manual - Either| CheckAuth1{Is Caller<br/>Creator or Opponent?}
    Type -->|Manual - Initiator| CheckAuth2{Is Caller<br/>Creator?}
    Type -->|Manual - Receiver| CheckAuth3{Is Caller<br/>Opponent?}
    Type -->|ThirdParty| CheckAuth4{Is Caller<br/>Arbitrator?}
    Type -->|AutoPegged| CheckPublic[Check Linked<br/>Public Market]
    Type -->|PolymarketOracle| CheckPoly[Check Polymarket<br/>Condition]

    CheckAuth1 -->|No| Reject1[Revert: NotAuthorized]
    CheckAuth2 -->|No| Reject2[Revert: NotAuthorized]
    CheckAuth3 -->|No| Reject3[Revert: NotAuthorized]
    CheckAuth4 -->|No| Reject4[Revert: NotAuthorized]

    CheckAuth1 -->|Yes| SubmitOutcome
    CheckAuth2 -->|Yes| SubmitOutcome
    CheckAuth3 -->|Yes| SubmitOutcome
    CheckAuth4 -->|Yes| SubmitOutcome

    SubmitOutcome[Submit Outcome<br/>true/false] --> Resolved

    CheckPublic --> PublicResolved{Public Market<br/>Resolved?}
    PublicResolved -->|No| RejectNotResolved1[Revert: NotResolved]
    PublicResolved -->|Yes| FetchPublic[Fetch passValue/failValue]
    FetchPublic --> DetermineOutcome1[Determine Outcome<br/>pass > fail?]
    DetermineOutcome1 --> Resolved

    CheckPoly --> PolyResolved{Polymarket<br/>Condition Resolved?}
    PolyResolved -->|No| RejectNotResolved2[Revert: PolymarketNotResolved]
    PolyResolved -->|Yes| FetchPoly[Fetch Payout Numerators]
    FetchPoly --> DetermineOutcome2[Determine Outcome<br/>passNum > failNum?]
    DetermineOutcome2 --> Resolved

    Resolved[Mark Wager Resolved] --> EmitEvents[Emit Resolution Events]
    EmitEvents --> UpdateState[Update Market Status]
    UpdateState --> WinnerClaim[Winner Can Claim]

    WinnerClaim --> End([End])
```

### Flow 4: Claim Winnings

```mermaid
flowchart TD
    Start([User Views Resolved Wager]) --> CheckWinner{Is User<br/>the Winner?}

    CheckWinner -->|No| NoAction[No Claim Available]
    NoAction --> End([End])

    CheckWinner -->|Yes| CheckClaimed{Already<br/>Claimed?}

    CheckClaimed -->|Yes| AlreadyClaimed[Show "Already Claimed"]
    AlreadyClaimed --> End

    CheckClaimed -->|No| ShowAmount[Display Winnable Amount]
    ShowAmount --> ClickClaim[Click "Claim Winnings"]

    ClickClaim --> SignTx[Sign Claim Transaction]

    SignTx --> TxStatus{Transaction<br/>Status?}

    TxStatus -->|Failed| Error[Show Error<br/>Retry Option]
    Error --> SignTx

    TxStatus -->|Success| Transfer{Token<br/>Type?}

    Transfer -->|Native| NativeTransfer[Transfer Native Token]
    Transfer -->|ERC20| ERC20Transfer[Transfer ERC20]

    NativeTransfer --> Confirmed
    ERC20Transfer --> Confirmed

    Confirmed[Funds Received] --> UpdateBalance[Update UI Balance]
    UpdateBalance --> ShowSuccess[Show Success Message]
    ShowSuccess --> End
```

---

## Sequence Diagrams

### Sequence 1: Complete Wager Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Creator
    participant UI as Frontend
    participant Factory as P2PWagerFactory
    participant Token as StakeToken
    participant Oracle as OracleRegistry
    participant Poly as PolymarketAdapter
    participant Opponent
    participant Indexer as Subgraph

    Note over Creator, Indexer: Phase 1: Wager Creation

    Creator->>UI: Create new wager
    UI->>UI: Validate inputs
    UI->>Factory: createOneVsOneMarketPending()

    alt Native Token Stake
        Creator->>Factory: Send ETH with transaction
    else ERC20 Stake
        Creator->>Token: approve(factory, amount)
        Token-->>Creator: Approval confirmed
        Factory->>Token: transferFrom(creator, factory, amount)
    end

    Factory->>Factory: Store wager data
    Factory->>Factory: Record creator acceptance
    Factory-->>UI: Emit MarketCreatedPending event
    UI-->>Creator: Show wager created
    Indexer->>Factory: Index creation event

    Note over Creator, Indexer: Phase 2: Share & Invite

    Creator->>UI: Click "Share to Twitter"
    UI->>UI: Generate share intent
    UI-->>Creator: Open Twitter with prefilled text

    Note over Creator, Indexer: Phase 3: Opponent Acceptance

    Opponent->>UI: Open wager link
    UI->>Factory: getFriendMarketWithStatus(wagerId)
    Factory-->>UI: Return wager details
    UI-->>Opponent: Display wager terms

    Opponent->>UI: Click "Accept Wager"

    alt Native Token Stake
        Opponent->>Factory: acceptMarket() + ETH
    else ERC20 Stake
        Opponent->>Token: approve(factory, amount)
        Factory->>Token: transferFrom(opponent, factory, amount)
    end

    Factory->>Factory: Check threshold met
    Factory->>Factory: Activate market
    Factory-->>UI: Emit MarketActivated event
    UI-->>Opponent: Show "Wager Active"
    Indexer->>Factory: Index activation event

    Note over Creator, Indexer: Phase 4: Peg to Polymarket

    Creator->>UI: Select resolution source
    UI->>Poly: Verify condition exists
    Poly-->>UI: Condition valid

    Creator->>Factory: pegToPolymarketCondition(wagerId, conditionId)
    Factory->>Poly: linkMarketToPolymarket()
    Poly-->>Factory: Link confirmed
    Factory->>Factory: Update resolutionType
    Factory-->>UI: Emit MarketPeggedToPolymarket
    Indexer->>Factory: Index pegging event

    Note over Creator, Indexer: Phase 5: Resolution

    Note right of Poly: Time passes...<br/>Polymarket resolves

    Creator->>UI: Check resolution status
    UI->>Poly: isConditionResolved(conditionId)
    Poly-->>UI: true

    Creator->>Factory: resolveFromPolymarket(wagerId)
    Factory->>Poly: getResolutionForMarket(wagerId)
    Poly-->>Factory: (passNum, failNum, denom, true)
    Factory->>Factory: Determine winner
    Factory->>Factory: Mark resolved
    Factory-->>UI: Emit PolymarketMarketResolved
    Factory-->>UI: Emit MarketResolved
    Indexer->>Factory: Index resolution event

    Note over Creator, Indexer: Phase 6: Claim Winnings

    Creator->>UI: View resolved wager
    UI->>Factory: Get winner status
    Factory-->>UI: Creator won

    Creator->>Factory: claimWinnings(wagerId)

    alt Native Token
        Factory->>Creator: Transfer ETH (both stakes)
    else ERC20
        Factory->>Token: transfer(creator, totalStake)
        Token->>Creator: Receive tokens
    end

    Factory-->>UI: Emit WinningsClaimed
    UI-->>Creator: Show success
    Indexer->>Factory: Index claim event
```

### Sequence 2: Batch Resolution from Polymarket

```mermaid
sequenceDiagram
    autonumber
    participant Anyone as Any User
    participant Factory as FriendGroupMarketFactory
    participant Adapter as PolymarketAdapter
    participant CTF as Polymarket CTF
    participant Indexer as Subgraph

    Note over Anyone, Indexer: Multiple wagers pegged to same Polymarket condition

    Anyone->>Factory: batchResolveFromPolymarket(conditionId)

    Factory->>Factory: Validate adapter set
    Factory->>Adapter: isConditionResolved(conditionId)

    Adapter->>CTF: isResolved(conditionId)
    CTF-->>Adapter: true
    Adapter-->>Factory: true

    Factory->>Adapter: fetchResolution(conditionId)
    Adapter->>CTF: getPayoutNumerators(conditionId)
    CTF-->>Adapter: [passNum, failNum]
    Adapter->>CTF: getPayoutDenominator(conditionId)
    CTF-->>Adapter: denominator
    Adapter->>Adapter: Cache resolution
    Adapter-->>Factory: (passNum, failNum, denom)

    Factory->>Factory: Determine outcome (passNum > failNum)

    loop For each pegged wager
        Factory->>Factory: Check wager active
        Factory->>Factory: Check resolutionType == PolymarketOracle
        Factory->>Factory: Mark resolved
        Factory-->>Anyone: Emit PolymarketMarketResolved
        Factory-->>Anyone: Emit MarketResolved
    end

    Indexer->>Factory: Index all resolution events
```

### Sequence 3: Expired Deadline Handling

```mermaid
sequenceDiagram
    autonumber
    participant Anyone as Any User
    participant Factory as FriendGroupMarketFactory
    participant Token as StakeToken
    participant Creator
    participant Opponent
    participant Indexer as Subgraph

    Note over Anyone, Indexer: Acceptance deadline has passed

    Anyone->>Factory: processExpiredDeadline(wagerId)

    Factory->>Factory: Validate wager exists
    Factory->>Factory: Check status == PendingAcceptance
    Factory->>Factory: Check block.timestamp >= deadline

    Factory->>Factory: Get accepted count
    Factory->>Factory: Get required threshold

    alt Threshold Met
        Factory->>Factory: Activate market
        Factory-->>Anyone: Emit MarketActivated
    else Threshold Not Met
        Factory->>Factory: Set status = Refunded

        loop For each participant who staked
            alt Native Token
                Factory->>Creator: Refund ETH stake
                Factory->>Opponent: Refund ETH stake (if accepted)
            else ERC20
                Factory->>Token: transfer(participant, stake)
                Token->>Creator: Receive refund
                Token->>Opponent: Receive refund (if accepted)
            end
            Factory-->>Anyone: Emit StakeRefunded
        end

        Factory-->>Anyone: Emit AcceptanceDeadlinePassed
    end

    Indexer->>Factory: Index deadline event
```

### Sequence 4: Oracle Registry Lookup

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant UI as Frontend
    participant Registry as OracleRegistry
    participant PolyAdapter as PolymarketAdapter
    participant ChainAdapter as ChainlinkAdapter
    participant UMAAdapter as UMAAdapter

    User->>UI: Search "ETH price above 5000"

    UI->>Registry: getRegisteredAdapters()
    Registry-->>UI: [polymarket, chainlink, uma]

    par Search Polymarket
        UI->>PolyAdapter: searchConditions("ETH 5000")
        PolyAdapter-->>UI: [condition1, condition2]
    and Search Chainlink
        UI->>ChainAdapter: searchFeeds("ETH")
        ChainAdapter-->>UI: [ETH/USD feed]
    and Search UMA
        UI->>UMAAdapter: searchAssertions("ETH")
        UMAAdapter-->>UI: [assertion1]
    end

    UI->>UI: Normalize and rank results
    UI-->>User: Display unified results

    User->>UI: Select Chainlink ETH/USD
    UI->>ChainAdapter: getConditionDetails(feedId)
    ChainAdapter-->>UI: Feed metadata

    User->>UI: Set threshold: $5000
    User->>UI: Set deadline: Dec 31, 2024
    UI-->>User: Ready to create wager
```

---

## Error Handling Paths

### Error Flow: Wager Creation Failures

```mermaid
flowchart TD
    Start([Create Wager]) --> Validate{Input<br/>Validation}

    Validate -->|Invalid Opponent| E1[Error: InvalidOpponent<br/>- Zero address<br/>- Same as creator]
    Validate -->|Empty Description| E2[Error: InvalidDescription]
    Validate -->|Bad Deadline| E3[Error: InvalidDeadline<br/>- Too soon: < 1 hour<br/>- Too far: > 30 days]
    Validate -->|Zero Stake| E4[Error: InvalidStake]
    Validate -->|Bad Odds| E5[Error: InvalidOdds<br/>- Multiplier < 200]
    Validate -->|Invalid Threshold| E6[Error: InvalidThreshold<br/>- < 2 participants<br/>- > invited count]

    Validate -->|Valid| CheckMembership{Check<br/>Membership}

    CheckMembership -->|No Role| E7[Error: MembershipRequired]
    CheckMembership -->|Expired| E8[Error: MembershipExpired]
    CheckMembership -->|Limit Reached| E9[Error: MarketLimitReached]

    CheckMembership -->|Valid| CheckNullifier{Check<br/>Nullifier}

    CheckNullifier -->|Nullified| E10[Error: AddressNullified<br/>- Creator or opponent<br/>on blocklist]

    CheckNullifier -->|Clear| CheckFunds{Check<br/>Funds}

    CheckFunds -->|Insufficient Native| E11[Error: InsufficientPayment]
    CheckFunds -->|ERC20 Transfer Fail| E12[Error: TransferFailed]

    CheckFunds -->|Sufficient| Success([Wager Created])

    E1 --> Recovery1[Fix opponent address]
    E2 --> Recovery2[Add description]
    E3 --> Recovery3[Adjust deadline]
    E4 --> Recovery4[Set valid stake]
    E5 --> Recovery5[Increase odds multiplier]
    E6 --> Recovery6[Adjust threshold]
    E7 --> Recovery7[Purchase membership]
    E8 --> Recovery8[Renew membership]
    E9 --> Recovery9[Wait for limit reset]
    E10 --> Recovery10[Contact support]
    E11 --> Recovery11[Add funds]
    E12 --> Recovery12[Approve token spend]

    Recovery1 --> Validate
    Recovery2 --> Validate
    Recovery3 --> Validate
    Recovery4 --> Validate
    Recovery5 --> Validate
    Recovery6 --> Validate
    Recovery7 --> CheckMembership
    Recovery8 --> CheckMembership
    Recovery9 --> CheckMembership
    Recovery10 --> Start
    Recovery11 --> CheckFunds
    Recovery12 --> CheckFunds
```

### Error Flow: Resolution Failures

```mermaid
flowchart TD
    Start([Resolve Wager]) --> CheckExists{Wager<br/>Exists?}

    CheckExists -->|No| E1[Error: InvalidMarketId]
    CheckExists -->|Yes| CheckActive{Wager<br/>Active?}

    CheckActive -->|No| E2[Error: NotActive]
    CheckActive -->|Yes| CheckType{Resolution<br/>Type?}

    CheckType -->|Manual| CheckAuth{Caller<br/>Authorized?}
    CheckType -->|AutoPegged| E3[Error: NotAuthorized<br/>Use autoResolvePeggedMarket]
    CheckType -->|PolymarketOracle| CheckPolyAdapter{Adapter<br/>Set?}

    CheckAuth -->|No| E4[Error: NotAuthorized]
    CheckAuth -->|Yes| CheckPegged{Already<br/>Pegged?}

    CheckPegged -->|Yes| E5[Error: AlreadyPegged]
    CheckPegged -->|No| ManualSuccess([Manual Resolution Success])

    CheckPolyAdapter -->|No| E6[Error: PolymarketAdapterNotSet]
    CheckPolyAdapter -->|Yes| CheckCondition{Condition<br/>Set?}

    CheckCondition -->|No| E7[Error: InvalidConditionId]
    CheckCondition -->|Yes| CheckResType{Resolution Type<br/>Correct?}

    CheckResType -->|No| E8[Error: InvalidResolutionType]
    CheckResType -->|Yes| FetchResolution[Fetch from Polymarket]

    FetchResolution --> CheckResolved{Condition<br/>Resolved?}

    CheckResolved -->|No| E9[Error: PolymarketNotResolved]
    CheckResolved -->|Yes| PolySuccess([Polymarket Resolution Success])

    E1 --> R1[Check wager ID]
    E2 --> R2[Wager already resolved/cancelled]
    E3 --> R3[Call correct function]
    E4 --> R4[Use authorized account]
    E5 --> R5[Use oracle resolution]
    E6 --> R6[Admin must set adapter]
    E7 --> R7[Peg to condition first]
    E8 --> R8[Check resolution type]
    E9 --> R9[Wait for Polymarket to resolve]
```

---

## Consistency Analysis

### State Transition Validity Matrix

```mermaid
graph LR
    subgraph "Valid Transitions"
        P1[Pending] -->|accept| A1[Active]
        P2[Pending] -->|cancel| C1[Cancelled]
        P3[Pending] -->|expire + no threshold| R1[Refunded]
        A2[Active] -->|resolve| S1[Resolved]
        A3[Active] -->|dispute| D1[Disputed]
        D2[Disputed] -->|arbitrate| S2[Resolved]
    end

    subgraph "Invalid Transitions ❌"
        X1[Pending] -.->|resolve| X2[Resolved]
        X3[Cancelled] -.->|accept| X4[Active]
        X5[Refunded] -.->|resolve| X6[Resolved]
        X7[Resolved] -.->|dispute| X8[Disputed]
    end

    style X1 fill:#ffcccc
    style X2 fill:#ffcccc
    style X3 fill:#ffcccc
    style X4 fill:#ffcccc
    style X5 fill:#ffcccc
    style X6 fill:#ffcccc
    style X7 fill:#ffcccc
    style X8 fill:#ffcccc
```

### Identified Consistency Issues

```mermaid
flowchart TD
    subgraph "Issue 1: Missing Dispute Flow"
        I1A[Active Wager] --> I1B{Manual Resolution<br/>Submitted}
        I1B --> I1C[Immediately Resolved]
        I1D[⚠️ No challenge window<br/>for manual resolutions]
        I1C -.-> I1D
    end

    subgraph "Issue 2: Orphaned Stakes"
        I2A[Wager Resolved] --> I2B{Winner Claims?}
        I2B -->|No| I2C[Stakes locked forever]
        I2D[⚠️ No timeout for<br/>unclaimed winnings]
        I2C -.-> I2D
    end

    subgraph "Issue 3: Arbitrator Incentives"
        I3A[ThirdParty Resolution] --> I3B{Arbitrator Resolves}
        I3B --> I3C[No payment to arbitrator]
        I3D[⚠️ No incentive for<br/>timely resolution]
        I3C -.-> I3D
    end

    subgraph "Issue 4: Oracle Failure"
        I4A[PolymarketOracle Type] --> I4B{Polymarket Never<br/>Resolves}
        I4B --> I4C[Wager stuck Active]
        I4D[⚠️ No fallback<br/>resolution mechanism]
        I4C -.-> I4D
    end
```

### Recommended Fixes

```mermaid
flowchart LR
    subgraph "Fix 1: Add Challenge Period"
        F1A[Manual Resolution] --> F1B[Challenge Window<br/>24-48 hours]
        F1B --> F1C{Challenged?}
        F1C -->|Yes| F1D[Escalate to Arbitration]
        F1C -->|No| F1E[Finalize Resolution]
    end

    subgraph "Fix 2: Claim Timeout"
        F2A[Wager Resolved] --> F2B[Winner has 90 days<br/>to claim]
        F2B --> F2C{Claimed in time?}
        F2C -->|No| F2D[Funds to DAO Treasury]
        F2C -->|Yes| F2E[Winner receives funds]
    end

    subgraph "Fix 3: Arbitrator Fee"
        F3A[Create with Arbitrator] --> F3B[Set arbitrator fee %]
        F3B --> F3C[Fee escrowed from stakes]
        F3C --> F3D[Paid on resolution]
    end

    subgraph "Fix 4: Oracle Fallback"
        F4A[Oracle Timeout] --> F4B[After 30 days past<br/>expected resolution]
        F4B --> F4C[Enable manual override]
        F4C --> F4D[Or refund both parties]
    end
```

---

## Cross-Reference: Contract Functions to States

| Function | Required State | New State | Events Emitted |
|----------|---------------|-----------|----------------|
| `createOneVsOneMarketPending` | N/A | PendingAcceptance | MarketCreatedPending, ArbitratorSet |
| `createBookmakerMarket` | N/A | PendingAcceptance | MarketCreatedPending, ArbitratorSet |
| `createSmallGroupMarketPending` | N/A | PendingAcceptance | MarketCreatedPending, ArbitratorSet |
| `acceptMarket` | PendingAcceptance | PendingAcceptance or Active | ParticipantAccepted, MarketActivated |
| `cancelPendingMarket` | PendingAcceptance | Cancelled | MarketCancelledByCreator, StakeRefunded |
| `processExpiredDeadline` | PendingAcceptance | Refunded or Active | AcceptanceDeadlinePassed, StakeRefunded or MarketActivated |
| `pegToPublicMarket` | Active | Active | MarketPeggedToPublic |
| `pegToPolymarketCondition` | Active | Active | MarketPeggedToPolymarket |
| `autoResolvePeggedMarket` | Active + AutoPegged | Resolved | PeggedMarketAutoResolved, MarketResolved |
| `resolveFromPolymarket` | Active + PolymarketOracle | Resolved | PolymarketMarketResolved, MarketResolved |
| `batchResolveFromPolymarket` | Active + PolymarketOracle | Resolved | PolymarketMarketResolved, MarketResolved (multiple) |
| `resolveFriendMarket` | Active + Manual type | Resolved | MarketResolved |

---

## Summary

This document provides complete visibility into the FairWins P2P wager system architecture. Key findings:

### Strengths
1. Clear state machine with well-defined transitions
2. Multiple resolution types supporting various use cases
3. Robust acceptance flow with deadlines and thresholds
4. External oracle integration (Polymarket) already implemented

### Areas Requiring Attention
1. **No dispute mechanism** for manual resolutions
2. **No claim timeout** - stakes could be locked forever
3. **No arbitrator incentives** - may lead to slow resolution
4. **No oracle fallback** - stuck wagers if oracle fails
5. **Missing claim function** - currently only events emitted, no fund transfer

### Next Steps
1. Implement `claimWinnings()` function
2. Add challenge period for manual resolutions
3. Add claim timeout with DAO treasury fallback
4. Add optional arbitrator fee mechanism
5. Add oracle timeout with manual override option
