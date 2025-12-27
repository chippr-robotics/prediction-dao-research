# Market Activity Badges and Intelligent User Nudges

## Overview

This document defines a comprehensive set of metrics and criteria for displaying informative badges on market cards within the FairWins and ClearPath platforms. These badges serve as subtle, non-intrusive signals that help users identify time-sensitive opportunities and make informed decisions without overwhelming them with noise.

## Design Philosophy

### Core Principles

1. **Rarity over Ubiquity**: Badges should be rare enough to maintain attention value. If every market has badges, none of them matter.
2. **Actionable Information**: Each badge should provide information that could reasonably influence a user's decision.
3. **Time Sensitivity**: Prioritize signals about changing conditions rather than static facts.
4. **Non-Intrusive Design**: Badges inform rather than distract; they should never feel like spam or marketing.
5. **Anti-Manipulation**: Design metrics to be resistant to market manipulation and gaming.
6. **Progressive Disclosure**: Show the most important signal first; avoid visual clutter.

### Badge Hierarchy

**Maximum badges per market card**: 1-2 badges maximum

**Priority order** (highest to lowest):
1. **Critical Time Events** (closing soon, resolution pending)
2. **Unusual Activity** (volume spikes, price swings)
3. **Lifecycle Transitions** (newly created, recently resolved)
4. **Market Health** (low liquidity warnings, dispute status)

## Badge Metrics and Thresholds

### 1. Time-Sensitive Badges

#### 1.1 Closing Soon
**Purpose**: Alert users to imminent market close where trading will end.

**Trigger Criteria**:
- Time remaining ≤ 6 hours
- Market is still in active trading phase
- Market has had at least 3 unique traders

**Badge Text**: 
- `🕐 Closes in Xh` (where X is hours remaining)
- `🕐 Closes in Xm` (when < 1 hour, show minutes)

**Priority**: Highest (Critical)

**Rationale**: Users need to know they're running out of time to take positions. This is highly actionable and time-critical.

**Display Duration**: Continuous during the last 6 hours

#### 1.2 Just Opened
**Purpose**: Highlight newly created markets with fresh opportunities.

**Trigger Criteria**:
- Market created within last 24 hours
- Has initial liquidity > minimum threshold
- No prior badges with higher priority

**Badge Text**: `✨ New Market`

**Priority**: Medium

**Rationale**: Early market participation often offers better odds before efficient price discovery. Helps users discover new opportunities.

**Display Duration**: First 24 hours only

#### 1.3 Resolving Soon
**Purpose**: Alert to markets approaching resolution date.

**Trigger Criteria**:
- Resolution date within 48 hours
- Market has closed trading
- Not yet resolved

**Badge Text**: `⏰ Resolves in Xd` (days) or `⏰ Resolves in Xh` (hours)

**Priority**: High

**Rationale**: Users may want to monitor markets they have positions in as resolution approaches.

**Display Duration**: 48 hours before resolution

### 2. Activity & Volume Badges

#### 2.1 Volume Surge
**Purpose**: Indicate unusual increase in trading activity.

**Trigger Criteria**:
- Trading volume in last hour > 3× the hourly average over previous 24 hours
- Minimum absolute volume: > 100 USDC equivalent in last hour
- Market must be active (not closed)
- Must have baseline data (market open > 6 hours)

**Badge Text**: `📈 High Activity`

**Priority**: High

**Rationale**: Volume surges often indicate new information or changing sentiment. Highly relevant for informed traders.

**Display Duration**: While surge condition persists, minimum 1 hour

**Cooldown**: After badge disappears, require 4-hour cooldown before reappearing

**Anti-Manipulation**: 
- Require volume from at least 3 distinct addresses
- Ignore self-trades (buy/sell from same address within 15 minutes)

#### 2.2 Unusual Inactivity
**Purpose**: Highlight markets that have gone quiet.

**Trigger Criteria**:
- No trades in last 12 hours
- Market previously had active trading (avg > 5 trades/day)
- Market still has > 7 days until close
- Market has meaningful liquidity (> 1000 USDC)

**Badge Text**: `💤 Quiet Market`

**Priority**: Low

**Rationale**: May indicate stale prices or forgotten markets with potential value opportunities.

**Display Duration**: While condition persists

**Note**: This badge is explicitly low-priority and should rarely appear alongside other badges.

### 3. Price Movement Badges

#### 3.1 Price Volatility
**Purpose**: Alert to rapid price changes indicating new information or uncertainty.

**Trigger Criteria**:
- Price change > 15% in last 3 hours
- OR price change > 25% in last 24 hours
- Market must be active
- Minimum liquidity: > 500 USDC

**Badge Text**: 
- `📊 +X%` (for upward movement, where X is % increase)
- `📊 -X%` (for downward movement, where X is % decrease)

**Priority**: High

**Rationale**: Significant price moves indicate changing market sentiment or new information. Actionable for traders.

**Display Duration**: 6 hours after movement detected

**Cooldown**: 6-hour cooldown after badge disappears

**Anti-Manipulation**:
- Calculate using time-weighted average price (TWAP) over 30-minute windows
- Require minimum trade count (at least 2 trades) contributing to movement
- Ignore price moves on extremely low volume (< 10 USDC)

#### 3.2 Price Extremes
**Purpose**: Identify markets with very high or very low probability signals.

**Trigger Criteria**:
- Current price > 0.90 or < 0.10 (90% or 10% probability)
- Position held for at least 6 hours
- Market still has > 24 hours until close

**Badge Text**: 
- `🎯 High Confidence` (when price > 0.90)
- `🎲 Long Shot` (when price < 0.10)

**Priority**: Medium

**Rationale**: Extreme prices may indicate strong consensus or overlooked opportunities. Helps users find contrarian positions.

**Display Duration**: While condition persists

### 4. Liquidity & Health Badges

#### 4.1 Low Liquidity Warning
**Purpose**: Warn users about markets with insufficient liquidity.

**Trigger Criteria**:
- Total liquidity < 100 USDC
- Market has been open > 48 hours
- Market has > 48 hours until close

**Badge Text**: `⚠️ Low Liquidity`

**Priority**: Medium

**Rationale**: Low liquidity leads to high slippage and may indicate lack of market confidence. Important risk information.

**Display Duration**: While condition persists

#### 4.2 Disputed Resolution
**Purpose**: Alert users to markets with contested outcomes.

**Trigger Criteria**:
- Market resolution has been challenged
- Challenge is active (not yet resolved)

**Badge Text**: `⚖️ Disputed`

**Priority**: High (Critical during dispute)

**Rationale**: Disputed markets carry additional risk and uncertainty. Users need to know about governance issues.

**Display Duration**: Duration of dispute period

### 5. Lifecycle & Status Badges

#### 5.1 Recently Resolved
**Purpose**: Show markets that have just concluded.

**Trigger Criteria**:
- Market resolved within last 48 hours
- Outcome has been finalized
- No active disputes

**Badge Text**: 
- `✅ Resolved: YES` or `✅ Resolved: NO`

**Priority**: Low

**Rationale**: Helps users track outcomes and learn from market results. Educational value.

**Display Duration**: 48 hours after resolution

#### 5.2 Awaiting Oracle
**Purpose**: Indicate markets waiting for outcome reporting.

**Trigger Criteria**:
- Trading period ended
- Resolution date passed
- No oracle report submitted yet
- Overdue by > 6 hours

**Badge Text**: `⏳ Awaiting Resolution`

**Priority**: Medium

**Rationale**: Users with positions need to know when resolution is delayed. Transparency about process.

**Display Duration**: Until oracle reports or market is resolved

### 6. Social & Engagement Badges

#### 6.1 Popular Market
**Purpose**: Highlight markets with strong community engagement.

**Trigger Criteria**:
- Number of unique traders > 90th percentile of all active markets
- AND trading volume > 75th percentile of all active markets
- Market has been open > 48 hours
- Market still has > 24 hours until close

**Badge Text**: `🔥 Trending`

**Priority**: Medium

**Rationale**: Popular markets often have better liquidity and information. Social proof is valuable.

**Display Duration**: While condition persists, recalculated every 6 hours

**Cooldown**: 24-hour cooldown after losing trending status

#### 6.2 Correlated Market
**Purpose**: Alert users to markets related to current positions or interests.

**Trigger Criteria**:
- User has position in a related/correlated market
- Correlation detected via tags, categories, or explicit grouping
- Market is active

**Badge Text**: `🔗 Related Market`

**Priority**: Low

**Rationale**: Helps users discover related opportunities and manage portfolio risk.

**Display Duration**: While user maintains position in related market

**Note**: This is a personalized badge and requires user context.

## Implementation Guidelines

### Badge Display Rules

#### Mutual Exclusivity
Some badges should never appear together:
- `Closing Soon` takes priority over `Just Opened`
- `Disputed` takes priority over `Recently Resolved`
- `Volume Surge` and `Unusual Inactivity` are mutually exclusive

#### Maximum Badge Count
- **Desktop/Tablet**: Maximum 2 badges per market card
- **Mobile**: Maximum 1 badge per market card
- Always show highest priority badge first

#### Visual Design

**Badge Anatomy**:
```
[Icon] [Text]
```

**Color Coding**:
- **Critical/Urgent** (red/orange): Closing Soon, Disputed
- **Positive/Opportunity** (green/blue): Volume Surge, New Market, Trending
- **Neutral/Info** (gray/blue): Price movement, Resolving Soon
- **Warning** (yellow/amber): Low Liquidity, Awaiting Oracle

**Size & Placement**:
- Badges: 24-28px height, auto width
- Position: Top-right corner of market card
- Padding: 6px horizontal, 4px vertical
- Border radius: 4px

**Accessibility**:
- Minimum contrast ratio: 4.5:1 (WCAG AA)
- Include aria-label with full explanation
- Don't rely solely on color (use icons + text)
- Support screen readers with descriptive text

### Metric Calculation

#### Data Requirements

**Required metrics tracking**:
1. **Volume metrics**:
   - Hourly trading volume (rolling 24-hour window)
   - Trade count per hour
   - Unique trader addresses per time period

2. **Price metrics**:
   - Current price (YES/NO tokens)
   - TWAP over 30-minute, 3-hour, 24-hour windows
   - Historical price snapshots (hourly)

3. **Liquidity metrics**:
   - Total liquidity in USDC equivalent
   - Liquidity depth at ±5% price levels

4. **Time metrics**:
   - Market creation timestamp
   - Trading end timestamp
   - Resolution timestamp
   - Current time

5. **Engagement metrics**:
   - Unique trader count (all-time)
   - Trade count (all-time)
   - Last trade timestamp

#### Calculation Frequency

**Real-time** (calculated on every request):
- Time-based badges (Closing Soon, Resolving Soon, Just Opened)
- Disputed status

**Every 5 minutes**:
- Price movements
- Liquidity levels

**Every 30 minutes**:
- Volume surge detection
- Unusual inactivity

**Every 6 hours**:
- Popular/Trending status
- Percentile calculations across all markets

#### Caching Strategy

- Cache badge decisions for 5 minutes per market
- Invalidate cache on new trades
- Pre-calculate percentiles for all markets in batch
- Store time-series data in efficient time-series database

### Anti-Manipulation Safeguards

#### Volume Manipulation Prevention

1. **Minimum Distinct Traders**: Require activity from at least 3 unique addresses
2. **Self-Trade Detection**: Ignore buy-sell pairs from same address within 15-minute window
3. **Minimum Trade Size**: Ignore trades < 5 USDC for volume calculations
4. **Rate Limiting**: Cooldown periods prevent badge flashing on/off
5. **TWAP Usage**: Time-weighted prices resist single large trades

#### Sybil Resistance

1. **Address Age**: Consider only addresses with on-chain history (not fresh wallets)
2. **Minimum Stake**: Weight traders by position size in unique trader counts
3. **Gas Cost Barrier**: On-chain activity naturally deters spam

#### False Positive Reduction

1. **Minimum Thresholds**: Absolute minimums prevent triggering on tiny markets
2. **Time Windows**: Require sustained conditions, not momentary spikes
3. **Statistical Outliers**: Use percentiles rather than absolute values where appropriate
4. **Context Requirements**: Multiple conditions must be met (AND logic)

### Edge Cases

#### Edge Case 1: Market Manipulation Attempt
**Scenario**: A whale tries to trigger "Volume Surge" badge by wash trading.

**Protection**:
- Self-trade detection catches buy-sell from same address
- Require 3+ distinct traders contributing to surge
- TWAP smoothing prevents single-trade price manipulation
- Cooldown prevents rapid badge cycling

**Result**: Badge won't trigger or will be delayed until legitimate activity

#### Edge Case 2: Badge Fatigue
**Scenario**: Too many markets show badges, desensitizing users.

**Protection**:
- Strict percentage-based thresholds (90th percentile for trending)
- Mutual exclusivity rules reduce total badge count
- Cooldown periods prevent constant badge presence
- Maximum 1-2 badges per card enforced

**Result**: Only truly notable markets get badges

#### Edge Case 3: Coordinated Badge Gaming
**Scenario**: Group of traders coordinate to trigger "Trending" status.

**Protection**:
- Require both unique traders AND volume thresholds
- Use percentile rankings (gaming one market doesn't help)
- 24-hour cooldown after losing trending status
- Compare against all active markets, not absolute values

**Result**: Expensive to game, low return on investment

#### Edge Case 4: Flash Crash / Fat Finger
**Scenario**: Single erroneous trade causes massive price movement.

**Protection**:
- TWAP calculation over 30-minute windows
- Require minimum 2 trades contributing to movement
- Ignore extreme outliers (> 3 standard deviations)
- 6-hour display duration allows recovery

**Result**: Momentary errors don't trigger badges

#### Edge Case 5: Market Near Close with Low Activity
**Scenario**: Market closing soon but has very few traders.

**Protection**:
- "Closing Soon" requires minimum 3 traders to show
- If below threshold, show "Low Liquidity" instead
- Prevents highlighting dead markets

**Result**: Only viable markets get closing alerts

#### Edge Case 6: Disputed Then Re-Resolved
**Scenario**: Market goes through multiple dispute cycles.

**Protection**:
- Badge updates in real-time based on current dispute status
- Clear badge text indicates current state
- No cooldown on critical status changes

**Result**: Users always see current, accurate status

## Badge Examples

### Example Badge Configurations

#### Example 1: Hot Market
**Market**: "Will ETH reach $5000 by Q1 2025?"
- Trading volume: 15,000 USDC in last hour (avg: 4,000 USDC/hour)
- Unique traders: 45
- Time to close: 5 days

**Badges Shown**: `📈 High Activity`

**Reasoning**: Volume surge meets criteria, market is highly active

---

#### Example 2: Last Call
**Market**: "Will candidate win election?"
- Time to close: 4 hours
- Unique traders: 78
- Volume: Steady

**Badges Shown**: `🕐 Closes in 4h`

**Reasoning**: Critical time badge takes priority, actionable urgency

---

#### Example 3: Underdog Opportunity
**Market**: "Will underdog team win championship?"
- Current price: 0.08 (8% probability)
- Stable for 12 hours
- Time to close: 3 days
- Liquidity: 5,000 USDC

**Badges Shown**: `🎲 Long Shot`

**Reasoning**: Extreme price indicates potential contrarian opportunity

---

#### Example 4: Risk Warning
**Market**: "Will new protocol launch on time?"
- Liquidity: 75 USDC
- Market age: 3 days
- Time to close: 4 days

**Badges Shown**: `⚠️ Low Liquidity`

**Reasoning**: Important risk information for potential traders

---

#### Example 5: Trending Topic
**Market**: "Will major tech announcement happen?"
- Unique traders: 120 (95th percentile)
- Volume: 25,000 USDC (80th percentile)
- Market age: 4 days
- Time to close: 10 days

**Badges Shown**: `🔥 Trending`

**Reasoning**: Strong engagement metrics, social proof

---

#### Example 6: Multiple Eligible Badges (Priority Selection)
**Market**: "Will GDP growth exceed forecast?"
- Time to close: 5 hours (eligible for "Closing Soon")
- Volume spike: 8× hourly average (eligible for "High Activity")
- Unique traders: 28

**Badges Shown**: 
1. `🕐 Closes in 5h` (Priority 1: Critical)
2. `📈 High Activity` (Priority 2: High)

**Reasoning**: Both badges shown as they provide complementary critical information

---

#### Example 7: No Badge Shown
**Market**: "Will routine event occur?"
- Market age: 5 days
- Time to close: 8 days
- Volume: Average, steady
- Price: 0.52 (near 50/50)
- Liquidity: 2,000 USDC
- Traders: 15

**Badges Shown**: None

**Reasoning**: Healthy market with no exceptional conditions. No badge needed.

## Testing & Validation

### Testing Checklist

#### Unit Tests
- [ ] Each metric calculation function
- [ ] Threshold detection logic
- [ ] Badge priority ordering
- [ ] Anti-manipulation filters
- [ ] Edge case handling

#### Integration Tests
- [ ] Badge display with real market data
- [ ] Multiple badges priority resolution
- [ ] Real-time updates on market changes
- [ ] Cache invalidation on trades
- [ ] Mobile vs desktop badge limiting

#### Performance Tests
- [ ] Metric calculation performance (< 50ms per market)
- [ ] Batch calculation for 1000+ markets
- [ ] Cache hit rates > 90%
- [ ] Database query optimization

#### User Acceptance Tests
- [ ] Badge visibility and readability
- [ ] User response to badge presence
- [ ] Click-through rates on badged markets
- [ ] A/B testing badge vs no-badge engagement

### Success Metrics

**Engagement Metrics**:
- Badge click-through rate: Target > 15%
- Badged market trade rate vs unbadged: Target 2-3× higher
- User feedback on badge helpfulness: Target > 4.0/5.0

**Quality Metrics**:
- Percentage of markets with badges: Target 5-15%
- False positive rate: Target < 5%
- Badge cycling frequency: Target < 10% of badges flash on/off

**Performance Metrics**:
- Badge calculation time: Target < 50ms per market
- Cache hit rate: Target > 90%
- Page load impact: Target < 100ms additional

### Monitoring & Refinement

**Continuous Monitoring**:
1. Track badge distribution across markets
2. Monitor for badge manipulation attempts
3. Analyze user engagement with badged vs unbadged markets
4. Collect user feedback on badge utility

**Refinement Process**:
1. Review metrics monthly
2. Adjust thresholds based on data
3. Add/remove badges based on user value
4. A/B test threshold changes

**Red Flags**:
- > 30% of markets showing badges (too many)
- < 2% of markets showing badges (too few)
- Low engagement with specific badge types
- High false positive complaints

## API Specification

### Badge Calculation Endpoint

```typescript
GET /api/markets/{marketId}/badges

Response: {
  badges: [
    {
      type: "CLOSING_SOON",
      priority: "critical",
      icon: "🕐",
      text: "Closes in 4h",
      ariaLabel: "This market closes in 4 hours",
      expiresAt: "2025-01-15T18:00:00Z",
      metadata: {
        hoursRemaining: 4
      }
    }
  ],
  calculatedAt: "2025-01-15T14:00:00Z",
  cacheUntil: "2025-01-15T14:05:00Z"
}
```

### Batch Badge Calculation

```typescript
POST /api/markets/badges/batch

Request: {
  marketIds: ["market-1", "market-2", "..."],
  userAddress?: "0x..." // Optional for personalized badges
}

Response: {
  badges: {
    "market-1": [...],
    "market-2": [...]
  },
  calculatedAt: "2025-01-15T14:00:00Z"
}
```

### Badge Configuration

```typescript
GET /api/config/badges

Response: {
  thresholds: {
    volumeSurgeMultiplier: 3.0,
    priceVolatilityPercent: 15.0,
    closingSoonHours: 6,
    // ... all configurable thresholds
  },
  enabled: {
    closingSoon: true,
    volumeSurge: true,
    // ... feature flags
  }
}
```

## Future Enhancements

### Phase 2 (Post-Launch)

1. **Personalized Badges**
   - Badge relevance based on user's portfolio
   - "Similar to Your Positions"
   - "Matches Your Interests"

2. **Machine Learning Enhancements**
   - Anomaly detection for unusual patterns
   - Predicted price movement badges
   - Market sentiment analysis

3. **Advanced Filters**
   - User preference: "Only show me X type of badges"
   - Badge importance levels
   - Customizable thresholds

4. **Historical Badges**
   - Badge history on market detail page
   - "This market was trending 2 days ago"
   - Badge event timeline

### Phase 3 (Future)

1. **Cross-Market Badges**
   - "Linked to 3 other markets"
   - "Part of a larger event"
   - Network effect badges

2. **Social Proof Badges**
   - "Followed by top traders"
   - "Creator has 95% accuracy"
   - Reputation-based signals

3. **Advanced Analytics**
   - Badge effectiveness A/B testing
   - Machine learning optimization
   - Predictive badge timing

## Conclusion

This specification provides a comprehensive framework for implementing market activity badges that:

1. ✅ Maintain rarity and attention value through strict thresholds
2. ✅ Provide actionable, time-sensitive information
3. ✅ Resist manipulation through multiple safeguards
4. ✅ Scale efficiently with caching and batch processing
5. ✅ Support iterative refinement through monitoring
6. ✅ Prioritize user experience over feature completeness

The badge system should be viewed as a living system that evolves based on user behavior and feedback, not a static set of rules. Regular review and adjustment of thresholds will be essential to maintaining the balance between helpful information and noise reduction.
