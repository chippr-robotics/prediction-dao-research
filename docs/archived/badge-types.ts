/**
 * Market Activity Badge Type Definitions
 * 
 * This file provides TypeScript interfaces and types for the market badge system.
 * It should be used as a reference for implementation in the frontend application.
 */

/**
 * Badge Priority Levels
 * Determines display order when multiple badges are eligible
 */
export enum BadgePriority {
  CRITICAL = 'critical',  // Red/urgent - must be seen
  HIGH = 'high',          // Important but not urgent
  MEDIUM = 'medium',      // Informative
  LOW = 'low'             // Nice to know
}

/**
 * Badge Types
 * Each type corresponds to a specific metric/condition
 */
export enum BadgeType {
  // Time-sensitive badges
  CLOSING_SOON = 'CLOSING_SOON',
  JUST_OPENED = 'JUST_OPENED',
  RESOLVING_SOON = 'RESOLVING_SOON',
  
  // Activity badges
  VOLUME_SURGE = 'VOLUME_SURGE',
  UNUSUAL_INACTIVITY = 'UNUSUAL_INACTIVITY',
  
  // Price movement badges
  PRICE_VOLATILITY = 'PRICE_VOLATILITY',
  HIGH_CONFIDENCE = 'HIGH_CONFIDENCE',
  LONG_SHOT = 'LONG_SHOT',
  
  // Health badges
  LOW_LIQUIDITY = 'LOW_LIQUIDITY',
  DISPUTED = 'DISPUTED',
  
  // Lifecycle badges
  RECENTLY_RESOLVED = 'RECENTLY_RESOLVED',
  AWAITING_ORACLE = 'AWAITING_ORACLE',
  
  // Social badges
  TRENDING = 'TRENDING',
  RELATED_MARKET = 'RELATED_MARKET'
}

/**
 * Badge Color Variants
 * Maps to CSS classes for styling
 */
export enum BadgeVariant {
  CRITICAL = 'critical',  // Red/orange
  POSITIVE = 'positive',   // Green/blue
  NEUTRAL = 'neutral',     // Gray/blue
  WARNING = 'warning'      // Yellow/amber
}

/**
 * Badge Metadata
 * Type-specific additional information
 */
export interface BadgeMetadata {
  // For time-based badges
  hoursRemaining?: number;
  minutesRemaining?: number;
  daysRemaining?: number;
  
  // For price movement badges
  priceChange?: number;
  priceChangePercent?: number;
  direction?: 'up' | 'down';
  
  // For volume badges
  volumeMultiplier?: number;
  currentVolume?: number;
  
  // For liquidity badges
  liquidityAmount?: number;
  
  // For social badges
  traderCount?: number;
  percentile?: number;
  
  // For related markets
  relatedMarketIds?: string[];
}

/**
 * Badge Definition
 * Complete badge information for display
 */
export interface Badge {
  /** Unique badge type identifier */
  type: BadgeType;
  
  /** Priority level for ordering */
  priority: BadgePriority;
  
  /** Color variant for styling */
  variant: BadgeVariant;
  
  /** Icon (emoji or icon name) */
  icon: string;
  
  /** Display text */
  text: string;
  
  /** Accessible label for screen readers */
  ariaLabel: string;
  
  /** When this badge expires (ISO 8601) */
  expiresAt?: string;
  
  /** Type-specific metadata */
  metadata?: BadgeMetadata;
  
  /** When badge was calculated */
  calculatedAt: string;
}

/**
 * Badge Configuration
 * Thresholds and settings for badge triggers
 */
export interface BadgeConfig {
  thresholds: {
    // Time-based thresholds
    closingSoonHours: number;
    justOpenedHours: number;
    resolvingSoonHours: number;
    
    // Volume thresholds
    volumeSurgeMultiplier: number;
    volumeSurgeMinimum: number;
    inactivityHours: number;
    
    // Price thresholds
    priceVolatility3Hours: number;
    priceVolatility24Hours: number;
    highConfidenceThreshold: number;
    longShotThreshold: number;
    
    // Liquidity thresholds
    lowLiquidityThreshold: number;
    
    // Social thresholds
    trendingTraderPercentile: number;
    trendingVolumePercentile: number;
    
    // Anti-manipulation
    minimumUniqueTraders: number;
    minimumTradeSize: number;
    selfTradeWindowMinutes: number;
  };
  
  /** Feature flags for enabling/disabling badges */
  enabled: Record<BadgeType, boolean>;
  
  /** Maximum badges per market card */
  maxBadgesPerCard: number;
  
  /** Maximum badges on mobile */
  maxBadgesOnMobile: number;
  
  /** Badge calculation cache TTL in seconds */
  cacheTTL: number;
}

/**
 * Market Metrics
 * Data required for badge calculation
 */
export interface MarketMetrics {
  // Identifiers
  marketId: string;
  
  // Time data
  createdAt: string;
  tradingEndTime: string;
  resolutionTime?: string;
  resolvedAt?: string;
  lastTradeAt?: string;
  
  // Volume data
  currentHourVolume: number;
  hourlyVolumeAverage24h: number;
  totalVolume: number;
  tradeCount: number;
  
  // Price data
  currentPrice: number;
  twap30min: number;
  twap3hour: number;
  twap24hour: number;
  priceHistory: Array<{
    timestamp: string;
    price: number;
  }>;
  
  // Liquidity data
  totalLiquidity: number;
  liquidityDepth5Percent: number;
  
  // Engagement data
  uniqueTraders: number;
  recentTraders1Hour: number;
  
  // Status data
  isActive: boolean;
  isResolved: boolean;
  isDisputed: boolean;
  hasOracleReport: boolean;
  
  // Percentile rankings (compared to all markets)
  traderCountPercentile?: number;
  volumePercentile?: number;
}

/**
 * Badge Calculation Request
 */
export interface BadgeCalculationRequest {
  /** Market IDs to calculate badges for */
  marketIds: string[];
  
  /** Optional user address for personalized badges */
  userAddress?: string;
  
  /** Force recalculation (bypass cache) */
  forceRefresh?: boolean;
}

/**
 * Badge Calculation Response
 */
export interface BadgeCalculationResponse {
  /** Badges per market ID */
  badges: Record<string, Badge[]>;
  
  /** When badges were calculated */
  calculatedAt: string;
  
  /** Cache expiration time */
  cacheUntil?: string;
}

/**
 * Badge Display Rules
 * Rules for which badges can be shown together
 */
export interface BadgeDisplayRules {
  /** Mutually exclusive badge pairs */
  mutuallyExclusive: Array<[BadgeType, BadgeType]>;
  
  /** Badge types that always take priority */
  alwaysShowIfEligible: BadgeType[];
  
  /** Badge types that should rarely appear */
  lowPriorityTypes: BadgeType[];
}

/**
 * Default Badge Display Rules
 */
export const DEFAULT_BADGE_RULES: BadgeDisplayRules = {
  mutuallyExclusive: [
    [BadgeType.CLOSING_SOON, BadgeType.JUST_OPENED],
    [BadgeType.DISPUTED, BadgeType.RECENTLY_RESOLVED],
    [BadgeType.VOLUME_SURGE, BadgeType.UNUSUAL_INACTIVITY]
  ],
  alwaysShowIfEligible: [
    BadgeType.CLOSING_SOON,
    BadgeType.DISPUTED
  ],
  lowPriorityTypes: [
    BadgeType.UNUSUAL_INACTIVITY,
    BadgeType.RECENTLY_RESOLVED,
    BadgeType.RELATED_MARKET
  ]
};

/**
 * Default Badge Configuration
 */
export const DEFAULT_BADGE_CONFIG: BadgeConfig = {
  thresholds: {
    closingSoonHours: 6,
    justOpenedHours: 24,
    resolvingSoonHours: 48,
    
    volumeSurgeMultiplier: 3.0,
    volumeSurgeMinimum: 100,
    inactivityHours: 12,
    
    priceVolatility3Hours: 0.15,  // 15%
    priceVolatility24Hours: 0.25,  // 25%
    highConfidenceThreshold: 0.90,  // 90%
    longShotThreshold: 0.10,  // 10%
    
    lowLiquidityThreshold: 100,  // USDC
    
    trendingTraderPercentile: 90,
    trendingVolumePercentile: 75,
    
    minimumUniqueTraders: 3,
    minimumTradeSize: 5,  // USDC
    selfTradeWindowMinutes: 15
  },
  
  enabled: {
    [BadgeType.CLOSING_SOON]: true,
    [BadgeType.JUST_OPENED]: true,
    [BadgeType.RESOLVING_SOON]: true,
    [BadgeType.VOLUME_SURGE]: true,
    [BadgeType.UNUSUAL_INACTIVITY]: true,
    [BadgeType.PRICE_VOLATILITY]: true,
    [BadgeType.HIGH_CONFIDENCE]: true,
    [BadgeType.LONG_SHOT]: true,
    [BadgeType.LOW_LIQUIDITY]: true,
    [BadgeType.DISPUTED]: true,
    [BadgeType.RECENTLY_RESOLVED]: true,
    [BadgeType.AWAITING_ORACLE]: true,
    [BadgeType.TRENDING]: true,
    [BadgeType.RELATED_MARKET]: false  // Requires user context
  },
  
  maxBadgesPerCard: 2,
  maxBadgesOnMobile: 1,
  cacheTTL: 300  // 5 minutes
};

/**
 * Helper function to get badge variant by type
 */
export function getBadgeVariant(type: BadgeType): BadgeVariant {
  const variantMap: Record<BadgeType, BadgeVariant> = {
    [BadgeType.CLOSING_SOON]: BadgeVariant.CRITICAL,
    [BadgeType.DISPUTED]: BadgeVariant.CRITICAL,
    [BadgeType.JUST_OPENED]: BadgeVariant.POSITIVE,
    [BadgeType.VOLUME_SURGE]: BadgeVariant.POSITIVE,
    [BadgeType.TRENDING]: BadgeVariant.POSITIVE,
    [BadgeType.RESOLVING_SOON]: BadgeVariant.NEUTRAL,
    [BadgeType.PRICE_VOLATILITY]: BadgeVariant.NEUTRAL,
    [BadgeType.HIGH_CONFIDENCE]: BadgeVariant.NEUTRAL,
    [BadgeType.LONG_SHOT]: BadgeVariant.NEUTRAL,
    [BadgeType.RECENTLY_RESOLVED]: BadgeVariant.NEUTRAL,
    [BadgeType.RELATED_MARKET]: BadgeVariant.NEUTRAL,
    [BadgeType.LOW_LIQUIDITY]: BadgeVariant.WARNING,
    [BadgeType.AWAITING_ORACLE]: BadgeVariant.WARNING,
    [BadgeType.UNUSUAL_INACTIVITY]: BadgeVariant.WARNING
  };
  return variantMap[type];
}

/**
 * Helper function to get badge priority by type
 */
export function getBadgePriority(type: BadgeType): BadgePriority {
  const priorityMap: Record<BadgeType, BadgePriority> = {
    [BadgeType.CLOSING_SOON]: BadgePriority.CRITICAL,
    [BadgeType.DISPUTED]: BadgePriority.CRITICAL,
    [BadgeType.VOLUME_SURGE]: BadgePriority.HIGH,
    [BadgeType.PRICE_VOLATILITY]: BadgePriority.HIGH,
    [BadgeType.RESOLVING_SOON]: BadgePriority.HIGH,
    [BadgeType.JUST_OPENED]: BadgePriority.MEDIUM,
    [BadgeType.TRENDING]: BadgePriority.MEDIUM,
    [BadgeType.LOW_LIQUIDITY]: BadgePriority.MEDIUM,
    [BadgeType.AWAITING_ORACLE]: BadgePriority.MEDIUM,
    [BadgeType.HIGH_CONFIDENCE]: BadgePriority.MEDIUM,
    [BadgeType.LONG_SHOT]: BadgePriority.MEDIUM,
    [BadgeType.RECENTLY_RESOLVED]: BadgePriority.LOW,
    [BadgeType.UNUSUAL_INACTIVITY]: BadgePriority.LOW,
    [BadgeType.RELATED_MARKET]: BadgePriority.LOW
  };
  return priorityMap[type];
}

/**
 * Helper function to format badge text
 */
export function formatBadgeText(type: BadgeType, metadata?: BadgeMetadata): string {
  switch (type) {
    case BadgeType.CLOSING_SOON:
      if (metadata?.minutesRemaining && metadata.minutesRemaining < 60) {
        return `Closes in ${metadata.minutesRemaining}m`;
      }
      return `Closes in ${metadata?.hoursRemaining || 0}h`;
      
    case BadgeType.JUST_OPENED:
      return 'New Market';
      
    case BadgeType.RESOLVING_SOON:
      if (metadata?.hoursRemaining && metadata.hoursRemaining < 24) {
        return `Resolves in ${metadata.hoursRemaining}h`;
      }
      return `Resolves in ${metadata?.daysRemaining || 0}d`;
      
    case BadgeType.VOLUME_SURGE:
      return 'High Activity';
      
    case BadgeType.UNUSUAL_INACTIVITY:
      return 'Quiet Market';
      
    case BadgeType.PRICE_VOLATILITY:
      const sign = metadata?.direction === 'up' ? '+' : '-';
      return `${sign}${metadata?.priceChangePercent || 0}%`;
      
    case BadgeType.HIGH_CONFIDENCE:
      return 'High Confidence';
      
    case BadgeType.LONG_SHOT:
      return 'Long Shot';
      
    case BadgeType.LOW_LIQUIDITY:
      return 'Low Liquidity';
      
    case BadgeType.DISPUTED:
      return 'Disputed';
      
    case BadgeType.RECENTLY_RESOLVED:
      return 'Resolved';
      
    case BadgeType.AWAITING_ORACLE:
      return 'Awaiting Resolution';
      
    case BadgeType.TRENDING:
      return 'Trending';
      
    case BadgeType.RELATED_MARKET:
      return 'Related Market';
      
    default:
      return '';
  }
}

/**
 * Helper function to get badge icon
 */
export function getBadgeIcon(type: BadgeType): string {
  const iconMap: Record<BadgeType, string> = {
    [BadgeType.CLOSING_SOON]: '🕐',
    [BadgeType.JUST_OPENED]: '✨',
    [BadgeType.RESOLVING_SOON]: '⏰',
    [BadgeType.VOLUME_SURGE]: '📈',
    [BadgeType.UNUSUAL_INACTIVITY]: '💤',
    [BadgeType.PRICE_VOLATILITY]: '📊',
    [BadgeType.HIGH_CONFIDENCE]: '🎯',
    [BadgeType.LONG_SHOT]: '🎲',
    [BadgeType.LOW_LIQUIDITY]: '⚠️',
    [BadgeType.DISPUTED]: '⚖️',
    [BadgeType.RECENTLY_RESOLVED]: '✅',
    [BadgeType.AWAITING_ORACLE]: '⏳',
    [BadgeType.TRENDING]: '🔥',
    [BadgeType.RELATED_MARKET]: '🔗'
  };
  return iconMap[type];
}
