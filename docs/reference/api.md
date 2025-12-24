# API Reference

Practical guide to interacting with Prediction DAO smart contracts through real-world examples and scenarios.

## Understanding the API Philosophy

The Prediction DAO API is not just a collection of function signatures. Each endpoint represents a deliberate design choice about how participants interact with the governance system. Rather than providing every possible operation, the API focuses on the essential interactions that make futarchy-based governance work: submitting proposals, trading on markets, reporting outcomes, and executing decisions.

The contracts live on-chain, so every interaction happens through blockchain transactions. This means you pay gas fees, transactions are permanent, and there's no "undo" button. The API design reflects this reality with careful validation, clear error messages, and safeguards against common mistakes.

## Contract ABIs and Compilation

After compiling the contracts with `npx hardhat compile`, you'll find complete ABI files in the `artifacts/contracts/` directory. These JSON files contain function signatures, events, and everything needed to interact with deployed contracts.

## Submitting Proposals

Proposals start the entire governance process. When you have an idea that requires DAO resources, you package it as a proposal that goes through market validation.

### The submitProposal Function

```solidity
function submitProposal(
    string memory title,
    string memory description,
    uint256 fundingAmount,
    address recipient,
    uint256 welfareMetricId
) external payable returns (uint256 proposalId)
```

This function in ProposalRegistry accepts your proposal details and returns a unique identifier you'll use to track it through the system.

**Parameters explained:**

The `title` should be concise and descriptive, like "Upgrade oracle infrastructure" or "Fund mobile app development." Keep it under 100 characters so it displays properly in interfaces.

The `description` field holds your full proposal. Explain what you want to do, why it benefits the DAO, how you'll spend the funds, and what success looks like. Include milestones if the work spans multiple phases. Clear descriptions help traders make informed decisions.

The `fundingAmount` specifies how much ETC you need, denominated in wei. Remember that 1 ETC equals 10^18 wei. The contract enforces a maximum of 50,000 ETC per proposal to prevent single proposals from dominating the treasury.

The `recipient` address receives the funds if your proposal passes. This might be your own address for individual work, a multisig for team projects, or a contract address for automated distribution.

The `welfareMetricId` determines which success measure will evaluate your proposal. Option 1 typically represents treasury value, 2 for network activity, 3 for hash rate security, and 4 for developer activity. Choose the metric most relevant to your proposal's impact.

**The bond requirement:**

You must send exactly 50 ETC as `msg.value` when calling this function. This bond discourages spam and demonstrates commitment. You get it back when your proposal completes the process in good faith, even if markets reject it.

**Return value:**

The function returns a `proposalId`, a unique number identifying your proposal throughout its lifecycle. Save this ID to check status, monitor market prices, and track progress.

### Practical Example: Submitting a Development Proposal

Imagine you want to propose building a mobile wallet interface for the DAO. You estimate needing 500 ETC for six months of development work. Here's how that interaction looks in practice.

First, prepare your proposal details:

```javascript
const title = "Mobile Wallet Interface Development";
const description = `
Develop a mobile application for iOS and Android that allows 
governance token holders to participate in futarchy markets 
from their phones.

Milestones:
- Month 1-2: Design and architecture
- Month 3-4: Core wallet functionality
- Month 5: Market trading interface  
- Month 6: Testing and deployment

Success will be measured by enabling mobile participation, 
which should increase the network activity metric through 
higher transaction counts and more active addresses.
`;
const fundingAmount = ethers.parseEther("500"); // 500 ETC
const recipient = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"; // your address
const welfareMetricId = 2; // Network activity metric
const bondAmount = ethers.parseEther("50"); // Required bond
```

Then submit the transaction:

```javascript
const tx = await proposalRegistry.submitProposal(
    title,
    description, 
    fundingAmount,
    recipient,
    welfareMetricId,
    { value: bondAmount }
);

const receipt = await tx.wait();
const proposalId = receipt.events
    .find(e => e.event === 'ProposalSubmitted')
    .args.proposalId;

console.log(`Proposal submitted with ID: ${proposalId}`);
```

After submission, your proposal enters a seven-day review period. The community discusses it, asks questions, and evaluates whether it makes sense. Use this time to engage with feedback and clarify any confusion.

### Retrieving Proposal Details

Once submitted, you and others can retrieve proposal information:

```solidity
function getProposal(uint256 proposalId) 
    external 
    view 
    returns (Proposal memory)
```

This view function (which doesn't cost gas) returns the complete proposal struct containing all the details you submitted plus current status information.

**Example usage:**

```javascript
const proposal = await proposalRegistry.getProposal(proposalId);

console.log(`Title: ${proposal.title}`);
console.log(`Status: ${proposal.status}`); // Pending, Active, Resolved, etc.
console.log(`Funding: ${ethers.formatEther(proposal.fundingAmount)} ETC`);
console.log(`Proposer: ${proposal.proposer}`);
console.log(`Submitted: ${new Date(proposal.createdAt * 1000)}`);
```

The status field tells you where in the lifecycle your proposal currently sits. It might be pending review, active for trading, awaiting resolution, or completed.

## Trading on Prediction Markets

After a proposal passes review and gets activated, the ConditionalMarketFactory creates a prediction market with PASS and FAIL tokens. This is where the futarchy magic happens as traders aggregate their knowledge about whether your proposal will improve the chosen welfare metric.

### Understanding Market Prices

```solidity
function getMarketPrice(uint256 marketId, bool isPass) 
    external 
    view 
    returns (uint256 price)
```

This function tells you the current price for either PASS or FAIL tokens in a specific market. Prices are expressed as probabilities between 0 and 1, scaled to 18 decimals (like everything else in Ethereum).

**Parameters:**

The `marketId` corresponds to the proposal's market. When a proposal activates, the system creates a market and emits a `MarketCreated` event containing this ID.

The `isPass` boolean determines which token's price you want. Pass `true` for PASS token price, `false` for FAIL token price.

**Return value:**

The price comes back as a uint256 representing the current probability scaled to 18 decimals. A price of 0.65 × 10^18 means the market believes there's a 65% chance that outcome will maximize the welfare metric.

**Example usage:**

```javascript
const marketId = 1; // from MarketCreated event
const passPrice = await marketFactory.getMarketPrice(marketId, true);
const failPrice = await marketFactory.getMarketPrice(marketId, false);

console.log(`PASS token price: ${ethers.formatEther(passPrice)}`);
console.log(`FAIL token price: ${ethers.formatEther(failPrice)}`);
console.log(`Market believes ${ethers.formatEther(passPrice) * 100}% chance PASS scenario improves welfare`);
```

Prices always sum to 1 (technically 10^18 after scaling). If PASS trades at 0.65, FAIL trades at 0.35. This makes sense because one outcome must happen.

### Calculating Trade Costs

Before trading, you want to know how much a position will cost:

```solidity
function calculateCost(
    uint256 marketId,
    uint256 amount,
    bool isPass
) external view returns (uint256 cost)
```

The Logarithmic Market Scoring Rule (LMSR) means trade costs are non-linear. Your first token might cost 0.6 ETH, but if you keep buying, each subsequent token costs slightly more as you move the market price.

**Parameters:**

The `marketId` identifies which market you're interested in.

The `amount` specifies how many tokens you want to buy, in wei (the smallest unit).

The `isPass` boolean indicates which side you're buying.

**Return value:**

The function returns the total cost in wei for purchasing that amount of tokens at current prices.

**Example scenario:**

You believe a proposal to upgrade oracle infrastructure will improve treasury value. The PASS token currently trades at 0.45, suggesting the market is skeptical. You disagree and want to bet on the proposal succeeding.

```javascript
const marketId = 5;
const tokensWanted = ethers.parseEther("100"); // 100 tokens
const cost = await marketFactory.calculateCost(marketId, tokensWanted, true);

console.log(`Buying 100 PASS tokens will cost: ${ethers.formatEther(cost)} ETC`);

// Check if this fits your budget
const yourBalance = await ethers.provider.getBalance(yourAddress);
if (cost.lt(yourBalance)) {
    console.log("You can afford this trade");
} else {
    console.log("Insufficient funds");
}
```

The cost calculation accounts for price impact. Buying moves the price up, so you pay an average price higher than the starting price. Large trades have proportionally larger impact, which is why the LMSR prevents single traders from manipulating markets cheaply.

## Privacy-Preserving Trading

The privacy system requires a few extra steps compared to regular token purchases, but these steps protect your position from being tracked or used against you.

### Registering Your Public Key

Before your first encrypted trade, register a public key:

```solidity
function registerKey(
    uint256 publicKeyX,
    uint256 publicKeyY
) external
```

This public key comes from an elliptic curve keypair you generate locally. The contract stores the public key, while you keep the private key secret. All your encrypted positions will use this key until you change it.

**Parameters:**

The `publicKeyX` and `publicKeyY` are the two coordinates of your elliptic curve public key, split into uint256 values. Most cryptography libraries can generate these and extract the coordinates.

**Example setup:**

```javascript
// Generate a new keypair (this happens in your wallet, not on-chain)
const keyPair = await generateECDHKeyPair();
const publicKey = keyPair.publicKey;

// Extract coordinates
const publicKeyX = publicKey.x;
const publicKeyY = publicKey.y;

// Register with the privacy coordinator
const tx = await privacyCoordinator.registerKey(publicKeyX, publicKeyY);
await tx.wait();

console.log("Public key registered. You can now submit encrypted positions.");

// Store your private key securely
secureStorage.save(keyPair.privateKey);
```

You only need to register once unless you want to change keys. Your key persists across all markets and proposals.

### Submitting Encrypted Positions

When you're ready to trade with privacy protection:

```solidity
function submitEncryptedPosition(
    uint256 marketId,
    bytes32 commitment,
    bytes memory zkProof
) external
```

This function accepts your encrypted trading position without revealing details to public observers.

**Parameters:**

The `marketId` identifies which market you're trading in.

The `commitment` is a Poseidon hash of your actual position details (amount, direction, price, and a random nonce). This hash acts like a sealed envelope, proving you made a commitment without revealing what's inside.

The `zkProof` is a zero-knowledge proof demonstrating your position is valid. It proves you have sufficient balance, you're not double-spending, and your trade falls within valid parameters, all without revealing your specific position.

**Creating the commitment and proof:**

This happens client-side using specialized cryptographic libraries:

```javascript
// Your actual position (kept secret)
const position = {
    marketId: 5,
    amount: ethers.parseEther("100"),
    isPass: true,
    nonce: generateRandomNonce()
};

// Create Poseidon hash commitment
const commitment = poseidonHash([
    position.marketId,
    position.amount,
    position.isPass ? 1 : 0,
    position.nonce
]);

// Generate zkSNARK proof
const circuit = await loadCircuit('position_validity');
const proof = await circuit.generateProof({
    privateInputs: position,
    publicInputs: {
        commitment: commitment,
        userBalance: yourBalance
    }
});

// Submit to the blockchain
const tx = await privacyCoordinator.submitEncryptedPosition(
    position.marketId,
    commitment,
    proof
);

await tx.wait();
console.log("Encrypted position submitted successfully");
```

Your position goes into the current epoch's batch. When the epoch closes (after one hour), all positions in that batch get processed together. This batching prevents timing analysis where observers might correlate submission timing with price movements to infer your position.

From the blockchain's perspective, all anyone sees is that you submitted a commitment and a valid proof. They know you made a legitimate trade, but they don't know the size, direction, or specific details.

### Changing Keys for Anti-Collusion

If you suspect vote buying attempts or just want additional privacy, you can change your key:

```solidity
function submitKeyChange(
    bytes memory encryptedMessage
) external
```

The `encryptedMessage` contains your new public key, encrypted with your old private key. This encryption ensures only you can create valid key change messages for your account.

**Why change keys:**

Imagine someone offers to pay you for voting a certain way and asks you to prove it afterward. Without key changes, you might be tempted because you can prove your vote. With key changes, you can accept their payment, change your key afterward, and they have no way to verify whether you kept your promise. This makes vote buying unenforceable.

**Example usage:**

```javascript
// Generate a new keypair
const newKeyPair = await generateECDHKeyPair();

// Encrypt the new public key with your old private key
const oldPrivateKey = secureStorage.load();
const encryptedMessage = encryptWithECDH(
    oldPrivateKey,
    {
        newPublicKeyX: newKeyPair.publicKey.x,
        newPublicKeyY: newKeyPair.publicKey.y
    }
);

// Submit the key change
const tx = await privacyCoordinator.submitKeyChange(encryptedMessage);
await tx.wait();

console.log("Key changed. Previous positions invalidated.");

// Store new private key, discard old one
secureStorage.save(newKeyPair.privateKey);
```

After a key change, all your previous encrypted positions become invalid. The system cannot decrypt them anymore, and they don't count toward any commitments. You're essentially starting fresh with a clean slate.

## Oracle Reporting

When a market's trading period ends, someone needs to report the actual welfare metric values that occurred. This oracle reporting connects predictions to reality.

### Submitting Oracle Reports

```solidity
function submitReport(
    uint256 marketId,
    uint256 passValue,
    uint256 failValue,
    string memory evidenceURI
) external payable returns (uint256 reportId)
```

Anyone can become a designated reporter by being first to submit a valid report with the required bond.

**Parameters:**

The `marketId` identifies which market you're reporting on.

The `passValue` is the welfare metric value if the proposal passed. For example, if the proposal was to fund development and the welfare metric is treasury value, this would be the treasury's TWAP value in a counterfactual world where the proposal was implemented.

The `failValue` is the welfare metric value if the proposal failed. This represents the status quo or the counterfactual where the proposal wasn't implemented.

The `evidenceURI` points to detailed evidence supporting your values, typically an IPFS hash. This evidence should include methodology, data sources, calculations, and enough detail for others to verify your work.

**Bond requirement:**

You must send 100 ETC as `msg.value`. This bond gets returned if the community accepts your report or slashed if someone successfully challenges it.

**Example reporting:**

Say the oracle infrastructure proposal completed its market trading period. You want to report the actual impact on treasury value.

```javascript
// Research and calculate the values
const passValue = ethers.parseEther("1250000"); // Treasury value if passed
const failValue = ethers.parseEther("1200000"); // Treasury value if failed

// Prepare detailed evidence
const evidence = {
    methodology: "Time-weighted average price over 30 days",
    dataSources: ["DEX prices", "Oracle feeds", "On-chain balances"],
    calculations: "...",  // Detailed math
    passScenario: {
        treasuryComposition: {...},
        prices: {...},
        twapCalculation: "..."
    },
    failScenario: {
        treasuryComposition: {...},
        prices: {...},
        twapCalculation: "..."
    }
};

// Upload evidence to IPFS
const evidenceHash = await uploadToIPFS(evidence);
const evidenceURI = `ipfs://${evidenceHash}`;

// Submit report with bond
const bondAmount = ethers.parseEther("100");
const tx = await oracleResolver.submitReport(
    marketId,
    passValue,
    failValue,
    evidenceURI,
    { value: bondAmount }
);

const receipt = await tx.wait();
console.log("Report submitted successfully");
```

After submission, your report enters a settlement window where the community can review your evidence. If it looks good and no one challenges it, the report gets finalized and you receive your bond back. If someone challenges with better evidence, the system escalates to UMA for resolution.

### Challenging Reports

If you believe a report is inaccurate:

```solidity
function challengeReport(
    uint256 reportId,
    uint256 newPassValue,
    uint256 newFailValue,
    string memory counterEvidenceURI
) external payable
```

Challenging requires posting a 150 ETC bond (higher than the reporter's bond to prevent cheap griefing).

**Parameters:**

The `reportId` identifies which report you're challenging.

The `newPassValue` and `newFailValue` are your corrected values with proper methodology.

The `counterEvidenceURI` points to your evidence showing why the original report was wrong and your values are correct.

**Example challenge:**

```javascript
// You notice the reporter made an error in their TWAP calculation
const correctedPassValue = ethers.parseEther("1225000");
const correctedFailValue = ethers.parseEther("1200000");

// Prepare evidence showing the error
const counterEvidence = {
    originalError: "Reporter used spot price instead of TWAP",
    correctedMethodology: "30-day TWAP with proper weighting",
    calculations: "...",
    verification: "..."
};

const counterEvidenceURI = `ipfs://${await uploadToIPFS(counterEvidence)}`;

// Submit challenge with higher bond
const challengeBond = ethers.parseEther("150");
const tx = await oracleResolver.challengeReport(
    reportId,
    correctedPassValue,
    correctedFailValue,
    counterEvidenceURI,
    { value: challengeBond }
);

await tx.wait();
console.log("Challenge submitted. Dispute escalating to UMA.");
```

Successful challenges get rewarded. If UMA decides your evidence is more accurate, you receive your bond back plus a portion of the reporter's slashed bond. This incentivizes careful reporting and diligent verification.

## Executing Approved Proposals

After a proposal's market resolves and the timelock period passes, someone needs to trigger execution:

```solidity
function executeProposal(uint256 proposalId) external
```

This function in FutarchyGovernor releases funds to the recipient if the PASS market value exceeded the FAIL market value.

**Parameters:**

The `proposalId` identifies which proposal to execute.

**Conditions:**

Execution only succeeds if several conditions are met:
- The market has resolved with final values
- The PASS market value exceeded FAIL market value (proposal approved by markets)
- The timelock period (2 days) has passed
- The proposal hasn't already been executed
- The ragequit window has closed

**Example execution:**

```javascript
const proposalId = 42;

// Check if ready for execution
const proposal = await futarchyGovernor.governanceProposals(proposalId);
const currentTime = Math.floor(Date.now() / 1000);

if (proposal.phase !== ProposalPhase.Execution) {
    console.log("Proposal not ready for execution yet");
    return;
}

if (currentTime < proposal.executionTime) {
    const timeRemaining = proposal.executionTime - currentTime;
    console.log(`Timelock remaining: ${timeRemaining} seconds`);
    return;
}

// Execute the proposal
const tx = await futarchyGovernor.executeProposal(proposalId);
await tx.wait();

console.log("Proposal executed successfully. Funds transferred to recipient.");
```

Execution is permissionless. Anyone can call this function once conditions are met. Usually the proposal author does it, but community members or automated bots can trigger execution too.

## Reading Market State

Several view functions help you understand current market state without spending gas:

### Getting Total Liquidity

```solidity
function getTotalLiquidity(uint256 marketId) 
    external 
    view 
    returns (uint256 liquidity)
```

This returns the LMSR liquidity parameter for a market, which determines how much price impact trades have. Higher liquidity means more stable prices but requires more capital.

### Checking Position Counts

```solidity
function getPositionCount(uint256 marketId)
    external
    view
    returns (uint256 count)
```

Returns how many encrypted positions have been submitted for a market. This gives a sense of participation levels without revealing individual positions.

### Retrieving Your Own Positions

```solidity
function getUserPositions(address user)
    external
    view
    returns (uint256[] memory positionIds)
```

Returns an array of position IDs that belong to you. You can then decrypt these locally using your private key to see your actual positions, but others cannot.

## Events and Real-Time Monitoring

All important actions emit events that off-chain applications can monitor:

**ProposalSubmitted** fires when someone submits a new proposal:
```solidity
event ProposalSubmitted(
    uint256 indexed proposalId,
    address indexed proposer,
    string title,
    uint256 fundingAmount
);
```

**MarketCreated** fires when a proposal activates and gets its market:
```solidity
event MarketCreated(
    uint256 indexed marketId,
    uint256 indexed proposalId,
    uint256 startTime,
    uint256 endTime
);
```

**PositionSubmitted** fires for encrypted position submissions:
```solidity
event PositionSubmitted(
    uint256 indexed positionId,
    uint256 indexed marketId,
    address indexed user,
    bytes32 commitment
);
```

**ReportSubmitted** and **ReportChallenged** track oracle activity:
```solidity
event ReportSubmitted(
    uint256 indexed reportId,
    uint256 indexed marketId,
    address indexed reporter,
    uint256 passValue,
    uint256 failValue
);

event ReportChallenged(
    uint256 indexed reportId,
    address indexed challenger,
    uint256 newPassValue,
    uint256 newFailValue
);
```

**ProposalExecuted** confirms successful execution:
```solidity
event ProposalExecuted(
    uint256 indexed proposalId,
    address indexed recipient,
    uint256 amount
);
```

Monitoring these events allows interfaces to update in real-time as governance activity happens:

```javascript
// Listen for new proposals
proposalRegistry.on("ProposalSubmitted", (proposalId, proposer, title, amount) => {
    console.log(`New proposal #${proposalId}: ${title}`);
    console.log(`Requesting ${ethers.formatEther(amount)} ETC`);
    refreshProposalList();
});

// Listen for market creation
marketFactory.on("MarketCreated", (marketId, proposalId, startTime, endTime) => {
    console.log(`Market #${marketId} opened for proposal #${proposalId}`);
    console.log(`Trading until ${new Date(endTime * 1000)}`);
    startPriceMonitoring(marketId);
});

// Listen for oracle reports
oracleResolver.on("ReportSubmitted", (reportId, marketId, reporter, passValue, failValue) => {
    console.log(`Oracle report for market ${marketId}`);
    console.log(`PASS value: ${ethers.formatEther(passValue)}`);
    console.log(`FAIL value: ${ethers.formatEther(failValue)}`);
    notifyInterestedParties(marketId);
});
```

## Error Handling and Common Issues

The contracts include helpful error messages, but understanding common failure cases helps avoid wasted gas:

**"Insufficient bond"** means you didn't send enough ETC with your transaction. Check the required amount for the specific function and include it as `msg.value`.

**"Proposal already exists"** happens if you try to resubmit the same proposal. Each title must be unique, or you need to modify your proposal slightly.

**"Market not active"** occurs when trying to trade outside the trading period. Markets have specific start and end times. Check the market status before attempting trades.

**"Invalid proof"** means your zero-knowledge proof didn't verify. This usually indicates a mismatch between your commitment and proof, or an error in proof generation. Regenerate the proof with matching parameters.

**"Execution time not reached"** fires when trying to execute a proposal before the timelock expires. Wait for the timelock period to pass.

**"Markets must resolve before execution"** means the oracle hasn't reported final values yet. Wait for oracle reporting and resolution before attempting execution.

## Best Practices for API Usage

When building applications on top of these contracts, several practices improve reliability and user experience:

**Always estimate gas before submitting transactions.** Contract functions can have variable gas costs depending on state. Estimating prevents failed transactions from insufficient gas:

```javascript
const gasEstimate = await contract.estimateGas.functionName(params);
const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
const tx = await contract.functionName(params, { gasLimit });
```

**Handle reverts gracefully.** Transactions can fail for many reasons. Catch errors and present helpful messages:

```javascript
try {
    const tx = await proposalRegistry.submitProposal(...);
    await tx.wait();
} catch (error) {
    if (error.message.includes("Insufficient bond")) {
        alert("Please send at least 50 ETC bond with your proposal");
    } else {
        alert(`Transaction failed: ${error.message}`);
    }
}
```

**Cache view function results when appropriate.** View functions don't cost gas but do require network requests. Cache results that don't change frequently:

```javascript
// Cache proposal details which rarely change
const proposalCache = new Map();
async function getProposal(proposalId) {
    if (proposalCache.has(proposalId)) {
        return proposalCache.get(proposalId);
    }
    const proposal = await proposalRegistry.getProposal(proposalId);
    proposalCache.set(proposalId, proposal);
    return proposal;
}
```

**Monitor events for real-time updates** rather than polling state. Events provide instant notification when things change:

```javascript
// Better: Listen for events
marketFactory.on("PriceUpdate", updatePriceDisplay);

// Worse: Poll every few seconds
setInterval(async () => {
    const price = await marketFactory.getMarketPrice(marketId, true);
    updatePriceDisplay(price);
}, 5000);
```

**Validate inputs before sending transactions.** Check that addresses are valid, amounts are positive, and strings aren't empty:

```javascript
function validateProposal(title, description, amount, recipient) {
    if (!title || title.length > 100) {
        throw new Error("Title must be 1-100 characters");
    }
    if (!description || description.length < 50) {
        throw new Error("Description too short, provide details");
    }
    if (amount <= 0 || amount > ethers.parseEther("50000")) {
        throw new Error("Amount must be between 0 and 50,000 ETC");
    }
    if (!ethers.isAddress(recipient)) {
        throw new Error("Invalid recipient address");
    }
}
```

## Going Deeper

For complete function signatures and technical details, examine the contract source code in the `contracts/` directory. The contracts include extensive NatSpec comments explaining every function, parameter, and return value.

For integration examples showing how the frontend uses these APIs, check the `frontend/src/` directory. The React components demonstrate practical usage patterns and error handling.

For testing examples showing edge cases and expected behaviors, see the `test/` directory. The test files cover normal operation, error conditions, and security scenarios.

The [Smart Contracts](../developer-guide/smart-contracts.md) guide provides architectural context for how these contracts work together. The [System Overview](../system-overview/introduction.md) explains the broader governance model these APIs enable.

