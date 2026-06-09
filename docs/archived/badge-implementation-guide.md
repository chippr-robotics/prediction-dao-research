# Market Activity Badge Implementation Guide

## Overview

This guide provides practical implementation instructions for integrating the market activity badge system into the FairWins and ClearPath platforms.

## Prerequisites

- Familiarity with React and TypeScript
- Understanding of the existing codebase structure
- Access to market data and metrics
- Understanding of the badge specification ([market-activity-badges.md](./market-activity-badges.md))

## Architecture

### Component Structure

```
frontend/src/
├── components/
│   ├── ui/
│   │   └── Badge.jsx (existing)
│   ├── fairwins/
│   │   └── MarketTile.jsx (existing)
│   └── badges/
│       ├── MarketBadge.tsx (new)
│       └── BadgeCalculator.ts (new)
├── hooks/
│   └── useBadges.ts (new)
├── contexts/
│   └── BadgeContext.tsx (new)
├── utils/
│   └── badgeUtils.ts (new)
└── types/
    └── badges.ts (new)
```

### Data Flow

```
Market Data → Badge Calculator → Badge Filter → Badge Sorter → Display Component
```

## Step 1: Type Definitions

Copy the type definitions from `badge-types.ts` to your project:

```bash
cp docs/reference/badge-types.ts frontend/src/types/badges.ts
```

Or create the file manually with the types from the reference documentation.

## Step 2: Badge Calculation Utility

Create `frontend/src/utils/badgeUtils.ts`:

```typescript
import { Badge, BadgeType, MarketMetrics, BadgeConfig, DEFAULT_BADGE_CONFIG } from '../types/badges';
import { getBadgeIcon, getBadgeVariant, getBadgePriority, formatBadgeText } from '../types/badges';

/**
 * Calculate all eligible badges for a market
 */
export function calculateBadges(
  market: MarketMetrics,
  config: BadgeConfig = DEFAULT_BADGE_CONFIG
): Badge[] {
  const badges: Badge[] = [];
  const now = new Date();

  // Time-based badges
  if (config.enabled[BadgeType.CLOSING_SOON]) {
    const closingBadge = checkClosingSoon(market, config, now);
    if (closingBadge) badges.push(closingBadge);
  }

  if (config.enabled[BadgeType.JUST_OPENED]) {
    const openedBadge = checkJustOpened(market, config, now);
    if (openedBadge) badges.push(openedBadge);
  }

  if (config.enabled[BadgeType.RESOLVING_SOON]) {
    const resolvingBadge = checkResolvingSoon(market, config, now);
    if (resolvingBadge) badges.push(resolvingBadge);
  }

  // Activity badges
  if (config.enabled[BadgeType.VOLUME_SURGE]) {
    const surgeBadge = checkVolumeSurge(market, config);
    if (surgeBadge) badges.push(surgeBadge);
  }

  if (config.enabled[BadgeType.UNUSUAL_INACTIVITY]) {
    const inactivityBadge = checkUnusualInactivity(market, config, now);
    if (inactivityBadge) badges.push(inactivityBadge);
  }

  // Price badges
  if (config.enabled[BadgeType.PRICE_VOLATILITY]) {
    const volatilityBadge = checkPriceVolatility(market, config);
    if (volatilityBadge) badges.push(volatilityBadge);
  }

  if (config.enabled[BadgeType.HIGH_CONFIDENCE]) {
    const confidenceBadge = checkHighConfidence(market, config);
    if (confidenceBadge) badges.push(confidenceBadge);
  }

  if (config.enabled[BadgeType.LONG_SHOT]) {
    const longShotBadge = checkLongShot(market, config);
    if (longShotBadge) badges.push(longShotBadge);
  }

  // Health badges
  if (config.enabled[BadgeType.LOW_LIQUIDITY]) {
    const liquidityBadge = checkLowLiquidity(market, config);
    if (liquidityBadge) badges.push(liquidityBadge);
  }

  if (config.enabled[BadgeType.DISPUTED]) {
    const disputedBadge = checkDisputed(market);
    if (disputedBadge) badges.push(disputedBadge);
  }

  // Lifecycle badges
  if (config.enabled[BadgeType.RECENTLY_RESOLVED]) {
    const resolvedBadge = checkRecentlyResolved(market, config, now);
    if (resolvedBadge) badges.push(resolvedBadge);
  }

  if (config.enabled[BadgeType.AWAITING_ORACLE]) {
    const oracleBadge = checkAwaitingOracle(market, config, now);
    if (oracleBadge) badges.push(oracleBadge);
  }

  // Social badges
  if (config.enabled[BadgeType.TRENDING]) {
    const trendingBadge = checkTrending(market, config);
    if (trendingBadge) badges.push(trendingBadge);
  }

  return badges;
}

/**
 * Filter and sort badges for display
 */
export function selectBadgesForDisplay(
  badges: Badge[],
  maxBadges: number,
  isMobile: boolean = false
): Badge[] {
  if (badges.length === 0) return [];

  // Apply mobile limit
  const limit = isMobile ? 1 : maxBadges;

  // Sort by priority
  const sorted = badges.sort((a, b) => {
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });

  // Apply mutual exclusivity rules
  const filtered = applyMutualExclusivityRules(sorted);

  // Take top N badges
  return filtered.slice(0, limit);
}

/**
 * Apply mutual exclusivity rules
 */
function applyMutualExclusivityRules(badges: Badge[]): Badge[] {
  const mutuallyExclusive: Record<BadgeType, BadgeType[]> = {
    [BadgeType.CLOSING_SOON]: [BadgeType.JUST_OPENED],
    [BadgeType.DISPUTED]: [BadgeType.RECENTLY_RESOLVED],
    [BadgeType.VOLUME_SURGE]: [BadgeType.UNUSUAL_INACTIVITY],
  };

  const result: Badge[] = [];
  const seenTypes = new Set<BadgeType>();

  for (const badge of badges) {
    // Check if this badge type conflicts with already selected badges
    const conflicts = mutuallyExclusive[badge.type] || [];
    const hasConflict = conflicts.some(type => seenTypes.has(type));

    if (!hasConflict) {
      result.push(badge);
      seenTypes.add(badge.type);
    }
  }

  return result;
}

// Individual badge check functions

function checkClosingSoon(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  if (!market.isActive) return null;
  if (market.uniqueTraders < config.thresholds.minimumUniqueTraders) return null;

  const endTime = new Date(market.tradingEndTime);
  const hoursRemaining = (endTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining <= config.thresholds.closingSoonHours && hoursRemaining > 0) {
    const minutesRemaining = Math.floor((endTime.getTime() - now.getTime()) / (1000 * 60));
    
    return {
      type: BadgeType.CLOSING_SOON,
      priority: getBadgePriority(BadgeType.CLOSING_SOON),
      variant: getBadgeVariant(BadgeType.CLOSING_SOON),
      icon: getBadgeIcon(BadgeType.CLOSING_SOON),
      text: formatBadgeText(BadgeType.CLOSING_SOON, { 
        hoursRemaining: Math.floor(hoursRemaining),
        minutesRemaining 
      }),
      ariaLabel: `This market closes in ${Math.floor(hoursRemaining)} hours`,
      expiresAt: market.tradingEndTime,
      metadata: { hoursRemaining: Math.floor(hoursRemaining), minutesRemaining },
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkJustOpened(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  const createdAt = new Date(market.createdAt);
  const hoursOpen = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursOpen <= config.thresholds.justOpenedHours && market.isActive) {
    return {
      type: BadgeType.JUST_OPENED,
      priority: getBadgePriority(BadgeType.JUST_OPENED),
      variant: getBadgeVariant(BadgeType.JUST_OPENED),
      icon: getBadgeIcon(BadgeType.JUST_OPENED),
      text: formatBadgeText(BadgeType.JUST_OPENED),
      ariaLabel: 'This is a newly created market',
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkResolvingSoon(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  if (!market.resolutionTime || market.isResolved || market.isActive) return null;

  const resolutionTime = new Date(market.resolutionTime);
  const hoursUntilResolution = (resolutionTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilResolution <= config.thresholds.resolvingSoonHours && hoursUntilResolution > 0) {
    const daysRemaining = Math.floor(hoursUntilResolution / 24);
    
    return {
      type: BadgeType.RESOLVING_SOON,
      priority: getBadgePriority(BadgeType.RESOLVING_SOON),
      variant: getBadgeVariant(BadgeType.RESOLVING_SOON),
      icon: getBadgeIcon(BadgeType.RESOLVING_SOON),
      text: formatBadgeText(BadgeType.RESOLVING_SOON, { 
        hoursRemaining: Math.floor(hoursUntilResolution),
        daysRemaining 
      }),
      ariaLabel: `This market resolves in ${daysRemaining > 0 ? daysRemaining + ' days' : Math.floor(hoursUntilResolution) + ' hours'}`,
      expiresAt: market.resolutionTime,
      metadata: { hoursRemaining: Math.floor(hoursUntilResolution), daysRemaining },
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkVolumeSurge(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  if (!market.isActive) return null;
  if (market.recentTraders1Hour < config.thresholds.minimumUniqueTraders) return null;

  const volumeRatio = market.currentHourVolume / market.hourlyVolumeAverage24h;

  if (
    volumeRatio >= config.thresholds.volumeSurgeMultiplier &&
    market.currentHourVolume >= config.thresholds.volumeSurgeMinimum
  ) {
    return {
      type: BadgeType.VOLUME_SURGE,
      priority: getBadgePriority(BadgeType.VOLUME_SURGE),
      variant: getBadgeVariant(BadgeType.VOLUME_SURGE),
      icon: getBadgeIcon(BadgeType.VOLUME_SURGE),
      text: formatBadgeText(BadgeType.VOLUME_SURGE),
      ariaLabel: 'This market is experiencing high trading activity',
      metadata: { 
        volumeMultiplier: volumeRatio,
        currentVolume: market.currentHourVolume 
      },
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkUnusualInactivity(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  if (!market.isActive || !market.lastTradeAt) return null;

  const lastTrade = new Date(market.lastTradeAt);
  const hoursSinceLastTrade = (now.getTime() - lastTrade.getTime()) / (1000 * 60 * 60);
  
  const tradingEndTime = new Date(market.tradingEndTime);
  const daysUntilClose = (tradingEndTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (
    hoursSinceLastTrade >= config.thresholds.inactivityHours &&
    daysUntilClose > 7 &&
    market.totalLiquidity >= 1000 &&
    market.hourlyVolumeAverage24h > 0 // Previously had activity
  ) {
    return {
      type: BadgeType.UNUSUAL_INACTIVITY,
      priority: getBadgePriority(BadgeType.UNUSUAL_INACTIVITY),
      variant: getBadgeVariant(BadgeType.UNUSUAL_INACTIVITY),
      icon: getBadgeIcon(BadgeType.UNUSUAL_INACTIVITY),
      text: formatBadgeText(BadgeType.UNUSUAL_INACTIVITY),
      ariaLabel: 'This market has been quiet recently',
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkPriceVolatility(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  if (!market.isActive) return null;

  const priceChange3h = Math.abs(market.currentPrice - market.twap3hour) / market.twap3hour;
  const priceChange24h = Math.abs(market.currentPrice - market.twap24hour) / market.twap24hour;

  if (
    priceChange3h >= config.thresholds.priceVolatility3Hours ||
    priceChange24h >= config.thresholds.priceVolatility24Hours
  ) {
    const direction = market.currentPrice > market.twap3hour ? 'up' : 'down';
    const percentChange = Math.round(priceChange3h * 100);

    return {
      type: BadgeType.PRICE_VOLATILITY,
      priority: getBadgePriority(BadgeType.PRICE_VOLATILITY),
      variant: getBadgeVariant(BadgeType.PRICE_VOLATILITY),
      icon: getBadgeIcon(BadgeType.PRICE_VOLATILITY),
      text: formatBadgeText(BadgeType.PRICE_VOLATILITY, { 
        direction, 
        priceChangePercent: percentChange 
      }),
      ariaLabel: `Price has moved ${direction} by ${percentChange}%`,
      metadata: { direction, priceChangePercent: percentChange },
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkHighConfidence(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  if (!market.isActive) return null;
  
  const tradingEndTime = new Date(market.tradingEndTime);
  const hoursUntilClose = (tradingEndTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (
    market.currentPrice >= config.thresholds.highConfidenceThreshold &&
    hoursUntilClose > 24
  ) {
    return {
      type: BadgeType.HIGH_CONFIDENCE,
      priority: getBadgePriority(BadgeType.HIGH_CONFIDENCE),
      variant: getBadgeVariant(BadgeType.HIGH_CONFIDENCE),
      icon: getBadgeIcon(BadgeType.HIGH_CONFIDENCE),
      text: formatBadgeText(BadgeType.HIGH_CONFIDENCE),
      ariaLabel: 'Market shows high confidence in YES outcome',
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkLongShot(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  if (!market.isActive) return null;
  
  const tradingEndTime = new Date(market.tradingEndTime);
  const hoursUntilClose = (tradingEndTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (
    market.currentPrice <= config.thresholds.longShotThreshold &&
    hoursUntilClose > 24 &&
    market.totalLiquidity >= 500
  ) {
    return {
      type: BadgeType.LONG_SHOT,
      priority: getBadgePriority(BadgeType.LONG_SHOT),
      variant: getBadgeVariant(BadgeType.LONG_SHOT),
      icon: getBadgeIcon(BadgeType.LONG_SHOT),
      text: formatBadgeText(BadgeType.LONG_SHOT),
      ariaLabel: 'Low probability outcome with potential high returns',
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkLowLiquidity(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  const createdAt = new Date(market.createdAt);
  const hoursOpen = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  
  const tradingEndTime = new Date(market.tradingEndTime);
  const hoursUntilClose = (tradingEndTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (
    market.totalLiquidity < config.thresholds.lowLiquidityThreshold &&
    hoursOpen > 48 &&
    hoursUntilClose > 48
  ) {
    return {
      type: BadgeType.LOW_LIQUIDITY,
      priority: getBadgePriority(BadgeType.LOW_LIQUIDITY),
      variant: getBadgeVariant(BadgeType.LOW_LIQUIDITY),
      icon: getBadgeIcon(BadgeType.LOW_LIQUIDITY),
      text: formatBadgeText(BadgeType.LOW_LIQUIDITY),
      ariaLabel: 'This market has low liquidity, which may result in high slippage',
      metadata: { liquidityAmount: market.totalLiquidity },
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkDisputed(market: MarketMetrics): Badge | null {
  if (market.isDisputed) {
    return {
      type: BadgeType.DISPUTED,
      priority: getBadgePriority(BadgeType.DISPUTED),
      variant: getBadgeVariant(BadgeType.DISPUTED),
      icon: getBadgeIcon(BadgeType.DISPUTED),
      text: formatBadgeText(BadgeType.DISPUTED),
      ariaLabel: 'This market resolution is currently disputed',
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}

function checkRecentlyResolved(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  if (!market.isResolved || !market.resolvedAt || market.isDisputed) return null;

  const resolvedAt = new Date(market.resolvedAt);
  const hoursSinceResolution = (now.getTime() - resolvedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceResolution <= 48) {
    return {
      type: BadgeType.RECENTLY_RESOLVED,
      priority: getBadgePriority(BadgeType.RECENTLY_RESOLVED),
      variant: getBadgeVariant(BadgeType.RECENTLY_RESOLVED),
      icon: getBadgeIcon(BadgeType.RECENTLY_RESOLVED),
      text: formatBadgeText(BadgeType.RECENTLY_RESOLVED),
      ariaLabel: 'This market was recently resolved',
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkAwaitingOracle(
  market: MarketMetrics,
  config: BadgeConfig,
  now: Date
): Badge | null {
  if (!market.resolutionTime || market.hasOracleReport || market.isResolved) return null;

  const resolutionTime = new Date(market.resolutionTime);
  const hoursOverdue = (now.getTime() - resolutionTime.getTime()) / (1000 * 60 * 60);

  if (hoursOverdue > 6) {
    return {
      type: BadgeType.AWAITING_ORACLE,
      priority: getBadgePriority(BadgeType.AWAITING_ORACLE),
      variant: getBadgeVariant(BadgeType.AWAITING_ORACLE),
      icon: getBadgeIcon(BadgeType.AWAITING_ORACLE),
      text: formatBadgeText(BadgeType.AWAITING_ORACLE),
      ariaLabel: 'This market is awaiting oracle resolution report',
      calculatedAt: now.toISOString()
    };
  }

  return null;
}

function checkTrending(
  market: MarketMetrics,
  config: BadgeConfig
): Badge | null {
  if (!market.isActive) return null;

  const createdAt = new Date(market.createdAt);
  const hoursOpen = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  
  const tradingEndTime = new Date(market.tradingEndTime);
  const hoursUntilClose = (tradingEndTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (
    hoursOpen > 48 &&
    hoursUntilClose > 24 &&
    market.traderCountPercentile !== undefined &&
    market.volumePercentile !== undefined &&
    market.traderCountPercentile >= config.thresholds.trendingTraderPercentile &&
    market.volumePercentile >= config.thresholds.trendingVolumePercentile
  ) {
    return {
      type: BadgeType.TRENDING,
      priority: getBadgePriority(BadgeType.TRENDING),
      variant: getBadgeVariant(BadgeType.TRENDING),
      icon: getBadgeIcon(BadgeType.TRENDING),
      text: formatBadgeText(BadgeType.TRENDING),
      ariaLabel: 'This is a popular trending market',
      metadata: { 
        traderCount: market.uniqueTraders,
        percentile: market.traderCountPercentile 
      },
      calculatedAt: new Date().toISOString()
    };
  }

  return null;
}
```

## Step 3: React Hook

Create `frontend/src/hooks/useBadges.ts`:

```typescript
import { useState, useEffect, useMemo } from 'react';
import { Badge, MarketMetrics } from '../types/badges';
import { calculateBadges, selectBadgesForDisplay } from '../utils/badgeUtils';

interface UseBadgesOptions {
  maxBadges?: number;
  isMobile?: boolean;
  refreshInterval?: number; // ms
}

export function useBadges(
  market: MarketMetrics | null,
  options: UseBadgesOptions = {}
) {
  const {
    maxBadges = 2,
    isMobile = false,
    refreshInterval = 60000 // 1 minute default
  } = options;

  const [badges, setBadges] = useState<Badge[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate badges
  const calculateMarketBadges = useMemo(() => {
    if (!market) return [];
    
    setIsCalculating(true);
    const allBadges = calculateBadges(market);
    const displayBadges = selectBadgesForDisplay(allBadges, maxBadges, isMobile);
    setIsCalculating(false);
    
    return displayBadges;
  }, [market, maxBadges, isMobile]);

  // Update badges when market changes
  useEffect(() => {
    setBadges(calculateMarketBadges);
  }, [calculateMarketBadges]);

  // Refresh badges periodically
  useEffect(() => {
    if (!refreshInterval || !market) return;

    const interval = setInterval(() => {
      const allBadges = calculateBadges(market);
      const displayBadges = selectBadgesForDisplay(allBadges, maxBadges, isMobile);
      setBadges(displayBadges);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [market, maxBadges, isMobile, refreshInterval]);

  return {
    badges,
    isCalculating,
    hasBadges: badges.length > 0
  };
}
```

## Step 4: Badge Component

Create `frontend/src/components/badges/MarketBadge.tsx`:

```typescript
import React from 'react';
import { Badge as BadgeType } from '../../types/badges';
import Badge from '../ui/Badge';
import './MarketBadge.css';

interface MarketBadgeProps {
  badge: BadgeType;
  compact?: boolean;
}

const MarketBadge: React.FC<MarketBadgeProps> = ({ badge, compact = false }) => {
  // Map badge variant to UI Badge component variant
  const getUIVariant = (variant: string) => {
    switch (variant) {
      case 'critical':
        return 'danger';
      case 'positive':
        return 'success';
      case 'warning':
        return 'warning';
      case 'neutral':
      default:
        return 'neutral';
    }
  };

  return (
    <Badge
      variant={getUIVariant(badge.variant)}
      icon={badge.icon}
      className={`market-badge market-badge-${badge.priority} ${compact ? 'compact' : ''}`}
      aria-label={badge.ariaLabel}
    >
      {badge.text}
    </Badge>
  );
};

export default MarketBadge;
```

Create `frontend/src/components/badges/MarketBadge.css`:

```css
.market-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.market-badge.compact {
  font-size: 0.75rem;
  padding: 2px 6px;
}

.market-badge-critical {
  animation: pulse-subtle 2s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.85;
  }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .market-badge {
    font-size: 0.75rem;
    padding: 3px 6px;
  }
}
```

## Step 5: Integration with MarketTile

Update `frontend/src/components/fairwins/MarketTile.jsx`:

```jsx
import { useBadges } from '../../hooks/useBadges';
import MarketBadge from '../badges/MarketBadge';
import './MarketTile.css';

function MarketTile({ market, onClick, isActive = false, compact = false }) {
  const { formatPrice } = usePrice();
  
  // Convert market data to MarketMetrics format
  const marketMetrics = {
    marketId: market.id,
    createdAt: market.createdAt,
    tradingEndTime: market.tradingEndTime,
    resolutionTime: market.resolutionTime,
    resolvedAt: market.resolvedAt,
    lastTradeAt: market.lastTradeAt,
    currentHourVolume: market.currentHourVolume || 0,
    hourlyVolumeAverage24h: market.hourlyVolumeAverage24h || 0,
    totalVolume: market.totalVolume || 0,
    tradeCount: market.tradeCount || 0,
    currentPrice: parseFloat(market.passTokenPrice),
    twap30min: market.twap30min || parseFloat(market.passTokenPrice),
    twap3hour: market.twap3hour || parseFloat(market.passTokenPrice),
    twap24hour: market.twap24hour || parseFloat(market.passTokenPrice),
    priceHistory: market.priceHistory || [],
    totalLiquidity: parseFloat(market.totalLiquidity),
    liquidityDepth5Percent: market.liquidityDepth5Percent || 0,
    uniqueTraders: market.uniqueTraders || 0,
    recentTraders1Hour: market.recentTraders1Hour || 0,
    isActive: market.status === 'active',
    isResolved: market.status === 'resolved',
    isDisputed: market.isDisputed || false,
    hasOracleReport: market.hasOracleReport || false,
    traderCountPercentile: market.traderCountPercentile,
    volumePercentile: market.volumePercentile,
  };
  
  const { badges, hasBadges } = useBadges(marketMetrics, {
    maxBadges: compact ? 1 : 2,
    isMobile: window.innerWidth < 768
  });

  // ... existing code ...

  return (
    <div 
      className={`market-tile ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex="0"
      aria-label={`View market: ${market.proposalTitle}`}
      aria-pressed={isActive}
    >
      <div className="tile-header">
        <div className="header-left">
          <div className="market-value">
            <span className="market-value-label">Market Value</span>
            <span className="market-value-amount">{formatPrice(market.totalLiquidity, { compact: true })}</span>
          </div>
        </div>
        <div className="header-right">
          {hasBadges && (
            <div className="badge-container">
              {badges.map((badge, index) => (
                <MarketBadge key={`${badge.type}-${index}`} badge={badge} compact={compact} />
              ))}
            </div>
          )}
          <span className="moneyline-label">Moneyline</span>
          <div className="probability-bar">
            <div 
              className="probability-fill" 
              style={{ width: `${calculateImpliedProbability(market.passTokenPrice)}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {/* ... rest of existing code ... */}
    </div>
  );
}

export default MarketTile;
```

Update `frontend/src/components/fairwins/MarketTile.css`:

```css
/* Add to existing styles */

.badge-container {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .badge-container {
    gap: 4px;
    margin-bottom: 4px;
  }
}
```

## Step 6: Backend API (Optional)

If implementing server-side badge calculation:

```typescript
// backend/routes/badges.ts
import express from 'express';
import { calculateBadges, selectBadgesForDisplay } from '../utils/badgeUtils';
import { getMarketMetrics } from '../services/marketService';

const router = express.Router();

// Get badges for a single market
router.get('/markets/:marketId/badges', async (req, res) => {
  try {
    const { marketId } = req.params;
    const metrics = await getMarketMetrics(marketId);
    
    const badges = calculateBadges(metrics);
    const displayBadges = selectBadgesForDisplay(badges, 2);
    
    res.json({
      badges: displayBadges,
      calculatedAt: new Date().toISOString(),
      cacheUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min cache
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate badges' });
  }
});

// Batch badge calculation
router.post('/markets/badges/batch', async (req, res) => {
  try {
    const { marketIds } = req.body;
    const results: Record<string, any[]> = {};
    
    await Promise.all(
      marketIds.map(async (id: string) => {
        const metrics = await getMarketMetrics(id);
        const badges = calculateBadges(metrics);
        results[id] = selectBadgesForDisplay(badges, 2);
      })
    );
    
    res.json({
      badges: results,
      calculatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate badges' });
  }
});

export default router;
```

## Step 7: Testing

Create test file `frontend/src/utils/__tests__/badgeUtils.test.ts`:

```typescript
import { calculateBadges, selectBadgesForDisplay } from '../badgeUtils';
import { BadgeType, MarketMetrics } from '../../types/badges';

describe('badgeUtils', () => {
  const mockMarket: MarketMetrics = {
    marketId: 'test-1',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    tradingEndTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    currentPrice: 0.65,
    twap30min: 0.63,
    twap3hour: 0.60,
    twap24hour: 0.58,
    priceHistory: [],
    totalLiquidity: 5000,
    liquidityDepth5Percent: 500,
    uniqueTraders: 25,
    recentTraders1Hour: 8,
    currentHourVolume: 1200,
    hourlyVolumeAverage24h: 300,
    totalVolume: 8000,
    tradeCount: 150,
    isActive: true,
    isResolved: false,
    isDisputed: false,
    hasOracleReport: false
  };

  describe('calculateBadges', () => {
    it('should detect closing soon badge', () => {
      const badges = calculateBadges(mockMarket);
      const closingSoon = badges.find(b => b.type === BadgeType.CLOSING_SOON);
      expect(closingSoon).toBeDefined();
    });

    it('should detect volume surge', () => {
      const badges = calculateBadges(mockMarket);
      const volumeSurge = badges.find(b => b.type === BadgeType.VOLUME_SURGE);
      expect(volumeSurge).toBeDefined();
    });

    it('should not show badges for inactive markets', () => {
      const inactiveMarket = { ...mockMarket, isActive: false };
      const badges = calculateBadges(inactiveMarket);
      expect(badges.length).toBe(0);
    });
  });

  describe('selectBadgesForDisplay', () => {
    it('should respect maximum badge count', () => {
      const badges = calculateBadges(mockMarket);
      const selected = selectBadgesForDisplay(badges, 1, false);
      expect(selected.length).toBeLessThanOrEqual(1);
    });

    it('should prioritize critical badges', () => {
      const badges = calculateBadges(mockMarket);
      const selected = selectBadgesForDisplay(badges, 2, false);
      if (selected.length > 0) {
        expect(['critical', 'high']).toContain(selected[0].priority);
      }
    });
  });
});
```

## Step 8: Configuration

Create a configuration file to easily adjust thresholds:

```typescript
// frontend/src/config/badges.ts
import { BadgeConfig } from '../types/badges';

export const BADGE_CONFIG: BadgeConfig = {
  thresholds: {
    closingSoonHours: 6,
    justOpenedHours: 24,
    resolvingSoonHours: 48,
    volumeSurgeMultiplier: 3.0,
    volumeSurgeMinimum: 100,
    inactivityHours: 12,
    priceVolatility3Hours: 0.15,
    priceVolatility24Hours: 0.25,
    highConfidenceThreshold: 0.90,
    longShotThreshold: 0.10,
    lowLiquidityThreshold: 100,
    trendingTraderPercentile: 90,
    trendingVolumePercentile: 75,
    minimumUniqueTraders: 3,
    minimumTradeSize: 5,
    selfTradeWindowMinutes: 15
  },
  enabled: {
    CLOSING_SOON: true,
    JUST_OPENED: true,
    RESOLVING_SOON: true,
    VOLUME_SURGE: true,
    UNUSUAL_INACTIVITY: true,
    PRICE_VOLATILITY: true,
    HIGH_CONFIDENCE: true,
    LONG_SHOT: true,
    LOW_LIQUIDITY: true,
    DISPUTED: true,
    RECENTLY_RESOLVED: true,
    AWAITING_ORACLE: true,
    TRENDING: true,
    RELATED_MARKET: false
  },
  maxBadgesPerCard: 2,
  maxBadgesOnMobile: 1,
  cacheTTL: 300
};
```

## Deployment Checklist

- [ ] Copy type definitions to project
- [ ] Implement badge calculation utilities
- [ ] Create React hook for badge management
- [ ] Create MarketBadge component
- [ ] Integrate badges into MarketTile component
- [ ] Add CSS styling for badges
- [ ] Implement caching strategy
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Test on mobile devices
- [ ] Monitor badge distribution (should be 5-15% of markets)
- [ ] Set up monitoring for badge effectiveness
- [ ] Document any custom thresholds
- [ ] Add A/B testing if desired

## Monitoring & Refinement

After deployment, track these metrics:

1. **Badge Distribution**: % of markets showing badges
2. **Engagement**: Click-through rate on badged vs unbadged markets
3. **User Feedback**: Surveys on badge usefulness
4. **Performance**: Badge calculation time
5. **False Positives**: User reports of inappropriate badges

Adjust thresholds monthly based on data.

## Support

For questions or issues with implementation:
- Review the specification: [market-activity-badges.md](./market-activity-badges.md)
- Check type definitions: [badge-types.ts](./badge-types.ts)
- See existing Badge component: `frontend/src/components/ui/Badge.jsx`
