# Understanding the Interface: A User's Perspective

When you first encounter Prediction DAO, the interface presents choices and information designed to help you accomplish your goals. This guide walks through what you see, what it means, and how to think about the decisions you'll make as you navigate the platform.

## The Landing Experience: Choosing Your Path

The first screen you encounter asks a fundamental question without stating it explicitly: what brings you here? Two prominent cards represent distinct pathways into the system. ClearPath's presentation emphasizes governance, institutions, and formal decision-making processes. FairWins highlights openness, creation, and flexibility. The visual design reinforces these differences while suggesting both options share underlying infrastructure.

You might arrive with a clear purpose: managing a DAO treasury, participating in governance, creating a prediction market, or trading on existing markets. Or you might be exploring, curious about futarchy or prediction markets in general. The interface accommodates both situations by providing enough context to make an informed choice without overwhelming you with details before you've committed to a direction.

The "Connect Wallet" button appears prominently regardless of which path interests you. This design recognizes that wallet connection forms the gateway to actual participation, not just passive browsing. The interface trusts you to understand what wallet connection means (MetaMask or compatible wallets) or guides you to documentation if you need that foundation.

## Dashboard: Your Command Center

After connecting and choosing a platform, you reach a dashboard that serves as your home base. The design prioritizes information you'll reference repeatedly while providing quick access to actions you might want to take.

### Active Proposals and Markets

The central area shows active proposals (in ClearPath) or markets (in FairWins). Each entry presents essential information compactly: the question or proposal title, current market prices showing consensus beliefs, time remaining before key transitions, and visual indicators of trading volume or activity level.

You scan this list differently depending on your purpose. If you're researching opportunities to trade, you look for proposals or markets where you might have insights others lack. If you're monitoring existing positions, you focus on markets where you hold tokens. If you're evaluating the DAO's current focus, you consider the range of active proposals collectively.

The interface doesn't make these different use cases explicit through separate views. Instead, the information architecture supports multiple reading strategies with the same presentation. You can sort by various criteria (time remaining, trading volume, your position size) to privilege the perspective relevant to your current goal.

### Your Positions

A dedicated section shows your active positions. Each entry reveals the proposal or market, your token type (PASS/FAIL or YES/NO), position size, entry price, current market price, and unrealized profit or loss. These metrics tell a story about your decision's current status.

Green numbers showing positive unrealized P/L indicate the market has moved in your predicted direction. Red numbers suggest the market disagrees with your initial judgment, though this doesn't necessarily mean you were wrong since resolution hasn't occurred yet. The interface presents these figures neutrally, avoiding judgment about whether you should maintain or exit positions.

The settled positions subsection becomes relevant after markets resolve. These entries show the final outcome, your payout amount, and realized profit or loss. A "Redeem" button appears for winning positions, making the next action clear without requiring you to understand complex token mechanics.

### Welfare Metrics and System Status

ClearPath's dashboard includes welfare metrics because they fundamentally shape how proposals are evaluated. The four metric categories (Treasury Value, Network Activity, Hash Rate Security, Developer Activity) appear with current values, trend indicators, and historical charts.

You reference these metrics when evaluating proposals. If a proposal claims it will improve treasury value, you check current baseline values and consider what improvement means in context. If developer activity has been declining, proposals targeting that metric might attract more support than during periods of strong organic growth.

FairWins' dashboard focuses less on formal metrics and more on market diversity. You see categories of active markets, trending topics, recently created markets, and markets approaching resolution. This organization helps you discover markets aligned with your interests or expertise.

## Exploring Proposals and Markets

When you click on a specific proposal or market, you transition from overview to detailed analysis mode. The interface recognizes this shift by providing significantly more information and functionality.

### Proposal Details View

The proposal details page organizes information to support your evaluation process. At the top, you find the core description: what the proposer wants to do, why they believe it benefits the DAO, how much funding they request, and what milestones they've committed to achieving.

Below this, the welfare metric selection appears with the proposer's justification for that choice. Understanding this connection helps you evaluate whether the proposal will actually move the selected metric in the predicted direction.

A budget breakdown shows how requested funds will be allocated. You can assess whether line items seem reasonable, whether any expenses appear excessive, and whether important costs might be missing. This transparency enables informed trading decisions.

The milestone section presents delivery timeline with specific completion criteria. You evaluate whether milestones are realistic, whether criteria are measurable, and whether the timeline allows adequate quality without excessive delay. Vague milestones or unrealistic deadlines signal potential problems.

Team or proposer information provides context about capability. Previous work, relevant experience, community reputation (if you recognize the address from prior participation), and any verifiable credentials help you assess execution likelihood.

### Market Interface

Adjacent to proposal details, the market interface shows current state and enables trading. The core market display presents PASS and FAIL token prices (or YES and NO in FairWins) with a visualization showing how prices have evolved over the trading period.

Current prices tell you what the aggregate market believes. A 0.72 PASS price suggests roughly 72% collective probability the proposal will succeed in improving its welfare metric. This number synthesizes all available information and all trader positions into a single signal, though you shouldn't treat it as an objective probability in any strict sense.

The price chart shows how beliefs have evolved. Did prices start uncertain and converge toward clarity? Have they oscillated as new information emerged? Did a sudden price movement coincide with news or discussion you can identify? These patterns help you understand market dynamics and potentially spot your own entry opportunities.

Trading volume indicates depth of participation. High volume suggests many traders have evaluated this proposal and expressed beliefs through positions. Low volume might mean limited attention (potentially creating opportunity if you have insights others lack) or might signal that the proposal isn't considered particularly important or controversial.

### Making Your Trade

When you decide to trade, the interface simplifies complex cryptographic operations into straightforward actions. You select which token you want to buy (PASS or FAIL, YES or NO), enter the amount you want to purchase, and review the estimated price and impact.

The system shows price impact because LMSR mechanics mean larger trades push prices further. If you're buying PASS tokens, each additional token purchased costs slightly more than the last, and the final price reflects this curve. The interface calculates the average price you'll pay across your entire purchase, helping you evaluate whether the trade makes economic sense.

Before confirming, you see estimated gas costs. These vary with network congestion, and the interface helps you set appropriate gas prices by showing fast/medium/slow options with different cost and speed tradeoffs. You choose based on urgency versus economy.

When you confirm, the system generates zero-knowledge proofs in your browser. A progress indicator shows this happening, typically taking several seconds depending on your device's computational power. You don't need to understand the cryptography; you just need to wait while your position becomes encrypted and validated.

The transaction then goes to the blockchain for confirmation. The interface shows pending status and updates when confirmation occurs. Your new position appears in your portfolio with all relevant details.

## Creating: Proposals in ClearPath and Markets in FairWins

The creation interfaces guide you through more complex processes with structured forms that enforce quality without feeling restrictive.

### ClearPath Proposal Submission

The proposal submission flow begins with basic information: title and description. A markdown editor provides formatting tools while showing a live preview, helping you see how your proposal will appear to others.

As you write, you think about your audience: DAO members who will read this and decide whether to buy PASS or FAIL tokens. You need to explain clearly what you want to do, why it matters, and how you'll accomplish it. The interface doesn't prescribe a specific structure, but the markdown preview helps you evaluate readability and organization.

The funding section requires specific details: total amount requested and recipient address. A prominent warning emphasizes checking the address carefully since blockchain transactions are irreversible. The interface might validate that the address is properly formatted but cannot verify it's actually your intended recipient.

Welfare metric selection presents a dropdown of the four categories. For each, the interface provides brief context about what that metric measures and what kinds of proposals it suits best. You think carefully about this choice because markets will evaluate your proposal against this metric specifically.

The milestone builder lets you add multiple milestones with descriptions, completion criteria, and timelock periods. Each milestone you add appears as a card you can edit or remove. This flexibility allows simple proposals with a single milestone or complex proposals with numerous sequential phases.

Before final submission, a review screen shows everything together. You read through once more, verify the recipient address again, check that the welfare metric makes sense, and confirm you have sufficient balance for both the bond and gas fees.

The bond requirement (50 ETC) provides a final moment of consideration. This amount is significant enough to discourage spam but returnable enough that good faith proposals don't face punitive costs. If you're uncertain, this might prompt you to refine your proposal further before submitting.

### FairWins Market Creation

Market creation in FairWins emphasizes precision in question framing and resolution criteria. The interface guides you through defining your market clearly enough that disputes become unlikely.

The market question field accepts your core question with a character limit encouraging conciseness. Below this, a larger text area lets you elaborate on resolution criteria, edge case handling, and evidence sources. The interface suggests thinking through questions like: What exactly counts as success? What date and time boundaries apply? Where will verification evidence come from? What happens in ambiguous situations?

You choose a resolution date, being realistic about when the outcome will be known. Too soon and you might not have enough information; too far out and traders might lose interest.

Initial liquidity requirements ask you to stake funds that will seed the LMSR market maker. The interface calculates recommended amounts based on your expected trading volume. You can adjust higher for deeper liquidity or lower for smaller niche markets, but there's a minimum threshold to ensure markets can function.

The creator bond works similarly to ClearPath's proposal bond, aligning your incentives with fair resolution. You'll get this back after properly resolving the market, but it will be forfeited if you fail to resolve or resolve dishonestly.

A preview section shows how your market will appear to potential traders. You see your question, resolution criteria, liquidity depth, and trading period displayed as others will encounter them. This preview helps you catch unclear phrasing or missing details before committing.

## Managing Over Time: Portfolio and Monitoring

As you accumulate positions and wait for resolutions, the portfolio interface becomes increasingly important.

### Portfolio Overview

Your portfolio view aggregates positions across all active markets. Summary metrics at the top show total position value, unrealized profit or loss, and capital deployed. These numbers give you a high-level sense of your overall standing.

Below the summary, positions group logically. Active positions (markets still trading) separate from pending resolution (trading ended but outcome not final) and settled positions (resolved and ready to redeem).

Each grouping lets you sort by various criteria: unrealized P/L to see your best and worst performers, time remaining to prioritize markets approaching key transitions, or position size to understand your concentration risk.

### Individual Position Details

Clicking on a position reveals its complete history and current state. You see your entry date and price, the current market price, how prices have evolved since your entry, and what factors might have driven price movements.

For active positions, you have action options: increase your position by buying more tokens, decrease by selling some, or exit completely by selling everything. The interface shows how each action would affect your average cost basis and unrealized P/L.

For pending resolution positions, you see the resolution phase status: whether an oracle report has been submitted, how much time remains in the challenge period, or if escalation to UMA is occurring. These details help you understand when you'll be able to redeem if your tokens win.

For settled positions, the redemption interface shows your token count, the payout rate per token based on final resolution, and your total payout amount. The "Redeem" button initiates the transaction that converts your winning tokens to actual value.

## Decision Points: The Interface Guides Without Deciding

Throughout your experience, the interface presents decision points without prescribing correct choices. It provides information, shows consequences of different options, and streamlines execution, but respects your judgment about what to do.

### When to Trade

The interface never tells you whether to buy PASS or FAIL, YES or NO. It shows you current prices, historical trends, trading volume, and time remaining. It surfaces the proposal or market details that matter for evaluation. It makes the trading process smooth. But it leaves the substantive decision to you.

This design reflects a belief that prediction markets work through aggregating diverse judgments. If the interface pushed toward particular choices, it would undermine the mechanism's core purpose. The interface enables your decision-making rather than substituting for it.

### How Much to Risk

Similarly, position sizing remains your choice. The interface shows your current balance, calculates how much you can afford including gas fees, and displays price impact for different trade sizes. It warns if you're about to spend more than you have or if your trade would cause extreme price movement. But within reasonable bounds, it lets you choose your own risk level.

This respects the reality that different people have different risk tolerances, different portfolio sizes, and different conviction levels. An optimal position size for one trader might be inappropriate for another, and the interface cannot make that determination.

### When to Exit

For positions showing unrealized losses, the interface presents your current situation neutrally. Red numbers indicate the market has moved against you, but the interface doesn't suggest you should cut losses or hold hoping for recovery. These strategic choices depend on whether you still believe your original analysis, whether new information changed the situation, how much loss you can tolerate, and numerous other factors only you can evaluate.

The same applies to winning positions. Green numbers show unrealized gains, but the interface doesn't advise whether to take profits or hold for potentially larger rewards. This timing decision involves predicting whether prices will move further in your favor or if current levels represent peaks before reversion.

### Creating Versus Participating

The interface makes both creation and participation equally accessible while acknowledging they involve different responsibilities. Creating proposals in ClearPath or markets in FairWins comes with greater accountability. You'll need to deliver on commitments (proposals) or resolve fairly (markets). The interface ensures you understand these responsibilities through confirmation steps and bond requirements.

Participating as a trader involves less responsibility but requires good judgment to profit. The interface makes trading straightforward while not hiding the reality that you can lose your investment if your predictions prove wrong.

Neither path is presented as superior. The interface suggests creating if you have ideas worth proposing or questions worth asking, and suggests trading if you have insights about existing proposals or markets. Many users do both at different times, and the interface flows naturally between these modes.

## The Privacy Layer: Invisible but Essential

Much of what makes the interface work happens invisibly. When you trade, zero-knowledge proofs encrypt your position automatically. The interface shows a brief "Generating proof..." message, but you don't see the actual cryptographic operations.

This invisibility is intentional. You don't need to understand elliptic curve pairings, Groth16 zkSNARKs, or Poseidon hash functions to benefit from privacy protection. The interface handles complexity while letting you focus on substantive decisions about what to trade and why.

Similarly, the key-change feature (for anti-collusion) appears as a simple button if you need it. The interface explains what it does (invalidates previous keys, preventing vote buying verification) without requiring you to understand MACI protocol details. You can use it if you encounter coercion attempts, knowing it will protect you without needing to understand exactly how.

This approach to complexity reflects a design philosophy: sophisticated mechanisms should enable simple interactions. The cryptography and market mechanics work in the background, allowing the interface to foreground the questions that matter: Is this proposal valuable? Will this event occur? What do market prices tell me? How confident am I in my analysis?

## Notifications and State Transitions

The interface keeps you informed about changes that matter without overwhelming you with updates about everything happening systemwide.

### What You See

When a proposal you're watching enters a new phase (trading ends, oracle reports, challenge period opens, resolution finalizes), you receive a notification. The format adapts to your preferences: in-app notifications you see next time you visit, browser push notifications if you enabled them, or external notifications if you configured webhooks or monitoring tools.

These notifications include just enough information to orient you: which proposal or market, what transition occurred, and what this means for you. A link takes you directly to the relevant details if you want to investigate immediately.

### What You Don't See

The interface doesn't notify you about markets you aren't involved with entering routine state transitions. Hundreds of proposals might be active across the platform, but you only care about the subset where you hold positions, submitted proposals, or explicitly chose to follow.

This filtering prevents notification fatigue while ensuring you don't miss important developments affecting your positions or interests. The interface assumes you can't and shouldn't track everything, so it helps you focus on what matters to you specifically.

## Accessibility and Learning Curve

The interface balances accessibility for newcomers with efficiency for experienced users.

### First-Time Experience

When you first connect, the interface detects you haven't used it before and offers a brief orientation tour. This tour highlights key sections (dashboard, proposals/markets, portfolio, settings) and explains the basic flow (browse, research, trade, monitor, redeem). The entire tour takes under two minutes, respecting that you probably want to explore rather than watch extensive tutorials.

After the tour, contextual help appears at key decision points. When you're about to make your first trade, a small tooltip explains what PASS and FAIL tokens mean and how pricing works. When you first submit a proposal, guidance appears about what makes proposals successful. These just-in-time explanations provide information when it's most relevant rather than frontloading everything.

### Experienced User Efficiency

As you use the platform repeatedly, you develop muscle memory for common actions. The interface supports this by maintaining consistent patterns: similar layouts across different pages, repeated interaction patterns for similar actions, and keyboard shortcuts for frequent operations.

Advanced features appear progressively. You don't see detailed analytics about your trading history until you've made enough trades for such analysis to be meaningful. You don't get portfolio optimization suggestions until you hold positions across multiple markets. The interface grows with your sophistication rather than presenting everything immediately.

### Documentation Integration

Throughout the interface, links to documentation appear contextually. Next to welfare metrics, a small icon links to detailed explanations of how they're calculated. Near the oracle submission interface, documentation about proper evidence gathering and reporting methodology stays easily accessible. When viewing market resolution challenges, explanations of the UMA escalation process are one click away.

This integration means you can dive deeper whenever you want clarification without leaving the context where your question arose. You don't need to remember to consult separate documentation; the interface brings documentation to you at relevant moments.

## The Interface Philosophy: Enabling Without Prescribing

The design approach throughout prioritizes enabling your goals without substituting the interface's judgment for yours. This philosophy manifests in several ways:

Information is presented neutrally. Market prices show what others believe without the interface endorsing those beliefs as correct. Welfare metrics display current values without suggesting whether they're good or bad. Proposal descriptions appear as written without editorial commentary.

Actions remain accessible without being pushed. If you want to trade, the interface makes it straightforward. If you want to wait for more information, nothing pushes you to act prematurely. If you want to submit a proposal, the process guides you through requirements without discouraging you with unnecessary friction.

Complexity is managed through progressive disclosure. Basic functionality appears immediately accessible. Advanced features reveal themselves when relevant. Technical details are available when you need them but don't clutter the primary interface.

Privacy is default, not optional. You don't choose whether to encrypt your positions; the interface does this automatically because the system's integrity depends on it. You can use key-change if needed, but your basic privacy is never compromised even if you don't actively manage it.

The interface succeeds when you stop noticing it. When you're deeply engaged in evaluating whether a proposal will improve network activity metrics, you're not thinking about clicking buttons or navigating menus. You're thinking about the substantive question, and the interface has faded into transparent infrastructure supporting your analysis. That transparency represents the design working as intended.
