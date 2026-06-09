# Market Activity Badges & Intelligent User Nudges

## Executive Summary

This document provides a comprehensive specification for implementing market activity badges on the FairWins and ClearPath prediction market platforms. The badge system is designed to provide subtle, non-intrusive signals that help users identify time-sensitive opportunities without overwhelming them with noise.

## Key Principles

1. **Rarity over Ubiquity**: Only 5-15% of markets should display badges
2. **Actionable Information**: Each badge provides information that could influence decisions
3. **Time Sensitivity**: Prioritize changing conditions over static facts
4. **Anti-Manipulation**: Resistant to gaming and market manipulation
5. **Progressive Disclosure**: Maximum 1-2 badges per market card

## Badge Categories

### 1. Time-Sensitive Badges (Highest Priority)
- **Closing Soon** 🕐 - Market closes in < 6 hours
- **Just Opened** ✨ - Created within last 24 hours
- **Resolving Soon** ⏰ - Resolution within 48 hours

### 2. Activity & Volume Badges
- **Volume Surge** 📈 - Trading volume 3× hourly average
- **Unusual Inactivity** 💤 - No trades in 12+ hours (previously active)

### 3. Price Movement Badges
- **Price Volatility** 📊 - 15%+ price change in 3 hours
- **High Confidence** 🎯 - Price > 90% (strong consensus)
- **Long Shot** 🎲 - Price < 10% (contrarian opportunity)

### 4. Market Health Badges
- **Low Liquidity** ⚠️ - Total liquidity < $100
- **Disputed** ⚖️ - Resolution currently challenged

### 5. Lifecycle Badges
- **Recently Resolved** ✅ - Resolved within 48 hours
- **Awaiting Oracle** ⏳ - Overdue oracle report (6+ hours)

### 6. Social Engagement Badges
- **Trending** 🔥 - Top 10% in traders & volume
- **Related Market** 🔗 - Connected to user's positions (personalized)

## Quick Start

### For Product Managers
- **Read**: [Market Activity Badge Specification](docs/archived/market-activity-badges.md)
- **Purpose**: Understand business goals, metrics, and user impact
- **Decision Points**: Badge thresholds, priorities, and display rules

### For Developers
- **Read**: [Badge Implementation Guide](docs/archived/badge-implementation-guide.md)
- **Reference**: [TypeScript Type Definitions](docs/archived/badge-types.ts)
- **Action**: Follow step-by-step integration instructions

### For Designers
- **Focus**: Badge visual design, color coding, and accessibility
- **See**: Badge anatomy and placement guidelines in specification
- **Variants**: Critical (red), Positive (green), Neutral (gray), Warning (yellow)

## Documentation Structure

```
docs/reference/
├── market-activity-badges.md      # Complete specification (21KB)
│   ├── Design philosophy
│   ├── Badge metrics & thresholds
│   ├── Anti-manipulation safeguards
│   ├── Edge cases & examples
│   └── Testing & validation
│
├── badge-types.ts                 # TypeScript definitions (12KB)
│   ├── Type definitions
│   ├── Interfaces & enums
│   ├── Default configurations
│   └── Helper functions
│
└── badge-implementation-guide.md  # Developer guide (31KB)
    ├── Step-by-step integration
    ├── Code examples
    ├── React hooks & components
    ├── Testing strategies
    └── Deployment checklist
```

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)
- [ ] Set up type definitions
- [ ] Implement badge calculation utilities
- [ ] Create data collection infrastructure
- [ ] Unit tests for badge logic

### Phase 2: Frontend Integration (Week 3-4)
- [ ] Create React components
- [ ] Integrate with MarketTile component
- [ ] Implement caching strategy
- [ ] Mobile responsive design

### Phase 3: Testing & Refinement (Week 5-6)
- [ ] Integration testing
- [ ] User acceptance testing
- [ ] A/B testing setup
- [ ] Performance optimization

### Phase 4: Launch & Monitor (Week 7+)
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Monitor badge distribution
- [ ] Track engagement metrics
- [ ] Iterate based on data

## Success Metrics

### Engagement Targets
- **Badge CTR**: > 15% click-through rate
- **Trade Rate Lift**: 2-3× higher on badged markets
- **User Satisfaction**: > 4.0/5.0 helpfulness rating

### Quality Targets
- **Badge Distribution**: 5-15% of markets show badges
- **False Positive Rate**: < 5%
- **Badge Cycling**: < 10% flash on/off rapidly

### Performance Targets
- **Calculation Time**: < 50ms per market
- **Cache Hit Rate**: > 90%
- **Page Load Impact**: < 100ms additional

## Anti-Manipulation Framework

### Volume Manipulation Prevention
- Require 3+ distinct trader addresses
- Detect and ignore self-trades (same address within 15 min)
- Minimum trade size: $5 USDC
- Cooldown periods prevent badge flashing

### Price Manipulation Prevention
- Use TWAP (Time-Weighted Average Price) over 30-min windows
- Require minimum 2 trades for volatility badges
- Ignore extreme outliers (> 3 standard deviations)

### Sybil Resistance
- Consider address age and on-chain history
- Weight traders by position size
- Gas costs naturally deter spam

## Example Scenarios

### Scenario 1: Hot Political Market
**Market**: "Will candidate win primary election?"
- 2 hours until voting closes
- Volume surged 5× in last hour
- 150 unique traders

**Badges Shown**: 
1. 🕐 Closes in 2h (Critical priority)
2. 📈 High Activity (High priority)

**Result**: Users see urgent time constraint + high engagement signal

---

### Scenario 2: Undervalued Long Shot
**Market**: "Will underdog team win championship?"
- Price: 0.07 (7% probability)
- Stable for 18 hours
- Good liquidity: $8,000
- 5 days until close

**Badges Shown**: 🎲 Long Shot

**Result**: Contrarian traders discover potential value opportunity

---

### Scenario 3: Quiet Market
**Market**: "Will protocol upgrade happen on schedule?"
- No trades in 14 hours
- Previously active (avg 8 trades/day)
- $3,500 liquidity
- 10 days until close

**Badges Shown**: 💤 Quiet Market

**Result**: Value seekers find potentially mispriced market

---

### Scenario 4: No Badge (Healthy Market)
**Market**: "Will GDP growth exceed forecast?"
- 8 days until close
- Steady volume
- 52% probability (near 50/50)
- $5,000 liquidity

**Badges Shown**: None

**Result**: Market is functioning normally, no exceptional signals needed

## Risk Mitigation

### Edge Case Handling

1. **Flash Crash Protection**: TWAP smoothing prevents single-trade triggers
2. **Badge Fatigue Prevention**: Strict percentile thresholds + cooldowns
3. **Coordinated Gaming**: Requires both volume AND unique traders
4. **False Positives**: Multiple conditions required (AND logic)
5. **Low-Quality Markets**: Minimum liquidity + trader thresholds

### Monitoring & Alerts

Monitor these signals for problems:
- 🚨 > 30% markets showing badges (too many)
- 🚨 < 2% markets showing badges (too few)
- 🚨 Low engagement with badged markets
- 🚨 High false positive complaints

## Future Enhancements

### Phase 2 (Post-Launch)
- Personalized badges based on user portfolio
- Machine learning for anomaly detection
- Customizable badge preferences
- Historical badge timeline

### Phase 3 (Future)
- Cross-market relationship badges
- Social proof badges (top trader activity)
- Predictive badges (ML-based forecasts)
- Advanced analytics dashboard

## Getting Started

1. **Review the Specification**: Read [market-activity-badges.md](docs/archived/market-activity-badges.md) for complete details
2. **Check Type Definitions**: Review [badge-types.ts](docs/archived/badge-types.ts) for implementation reference
3. **Follow Implementation Guide**: Use [badge-implementation-guide.md](docs/archived/badge-implementation-guide.md) for step-by-step integration
4. **Test Thoroughly**: Use provided test cases and create additional scenarios
5. **Monitor & Iterate**: Track metrics and adjust thresholds based on data

## Support & Questions

- **Specification Questions**: See [market-activity-badges.md](docs/archived/market-activity-badges.md)
- **Implementation Help**: See [badge-implementation-guide.md](docs/archived/badge-implementation-guide.md)
- **Type Reference**: See [badge-types.ts](docs/archived/badge-types.ts)
- **General Questions**: Contact the team or file an issue

## License

This specification is part of the ClearPath & FairWins project and is licensed under Apache License 2.0.

---

**Status**: ✅ Specification Complete | 📋 Ready for Implementation

**Last Updated**: 2025-12-27

**Version**: 1.0.0
