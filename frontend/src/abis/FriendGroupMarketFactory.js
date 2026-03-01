/**
 * FriendGroupMarketFactory ABI
 * For friend markets with multi-party acceptance flow
 */

// Resolution type enum values
export const ResolutionType = {
  Either: 0,      // Either creator OR opponent can resolve (default)
  Initiator: 1,   // Only creator can resolve
  Receiver: 2,    // Only opponent can resolve
  ThirdParty: 3,  // Designated arbitrator resolves
  AutoPegged: 4   // Auto-resolves based on linked public market
}

// Market type enum values
export const MarketType = {
  OneVsOne: 0,
  SmallGroup: 1,
  EventTracking: 2,
  PropBet: 3,
  Bookmaker: 4
}

export const FRIEND_GROUP_MARKET_FACTORY_ABI = [
  // View functions
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getFriendMarket',
    outputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'marketType', type: 'uint8' },
      { name: 'creator', type: 'address' },
      { name: 'members', type: 'address[]' },
      { name: 'arbitrator', type: 'address' },
      { name: 'memberLimit', type: 'uint256' },
      { name: 'creationFee', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'active', type: 'bool' },
      { name: 'description', type: 'string' },
      { name: 'peggedPublicMarketId', type: 'uint256' },
      { name: 'autoPegged', type: 'bool' },
      { name: 'paymentToken', type: 'address' },
      { name: 'liquidityAmount', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getFriendMarketWithStatus',
    outputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'marketType', type: 'uint8' },
      { name: 'creator', type: 'address' },
      { name: 'members', type: 'address[]' },
      { name: 'arbitrator', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'acceptanceDeadline', type: 'uint256' },
      { name: 'stakePerParticipant', type: 'uint256' },
      { name: 'stakeToken', type: 'address' },
      { name: 'acceptedCount', type: 'uint256' },
      { name: 'minThreshold', type: 'uint256' },
      { name: 'opponentOddsMultiplier', type: 'uint16' },
      { name: 'description', type: 'string' },
      { name: 'resolutionType', type: 'uint8' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getStakeRequirements',
    outputs: [
      { name: 'opponentStake', type: 'uint256' },
      { name: 'creatorStake', type: 'uint256' },
      { name: 'totalPot', type: 'uint256' },
      { name: 'oddsMultiplier', type: 'uint16' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getAcceptanceStatus',
    outputs: [
      { name: 'accepted', type: 'uint256' },
      { name: 'required', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'arbitratorRequired', type: 'bool' },
      { name: 'arbitratorAccepted', type: 'bool' },
      { name: 'status', type: 'uint8' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'friendMarketId', type: 'uint256' },
      { name: 'participant', type: 'address' }
    ],
    name: 'getParticipantAcceptance',
    outputs: [
      {
        components: [
          { name: 'participant', type: 'address' },
          { name: 'stakedAmount', type: 'uint256' },
          { name: 'acceptedAt', type: 'uint256' },
          { name: 'hasAccepted', type: 'bool' },
          { name: 'isArbitrator', type: 'bool' }
        ],
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getPendingParticipants',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getMyMarkets',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'ids', type: 'uint256[]' }],
    name: 'getFriendMarketsBatch',
    outputs: [
      { name: 'statuses', type: 'uint8[]' },
      { name: 'creators', type: 'address[]' },
      { name: 'stakeTokens', type: 'address[]' },
      { name: 'stakeAmounts', type: 'uint256[]' },
      { name: 'acceptedCounts', type: 'uint256[]' },
      { name: 'acceptanceDeadlines', type: 'uint256[]' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'friendMarketId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    name: 'isMember',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'friendMarketCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'getTradingPeriod',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'tieredRoleManager',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },

  // Admin functions
  {
    inputs: [{ name: '_tieredRoleManager', type: 'address' }],
    name: 'setTieredRoleManager',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },

  // Create market functions
  {
    inputs: [
      { name: 'opponent', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'tradingPeriod', type: 'uint256' },
      { name: 'arbitrator', type: 'address' },
      { name: 'acceptanceDeadline', type: 'uint256' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'stakeToken', type: 'address' },
      { name: 'resolutionType', type: 'uint8' }
    ],
    name: 'createOneVsOneMarketPending',
    outputs: [{ name: 'friendMarketId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'opponent', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'tradingPeriod', type: 'uint256' },
      { name: 'acceptanceDeadline', type: 'uint256' },
      { name: 'opponentStakeAmount', type: 'uint256' },
      { name: 'opponentOddsMultiplier', type: 'uint16' },
      { name: 'stakeToken', type: 'address' },
      { name: 'resolutionType', type: 'uint8' },
      { name: 'arbitrator', type: 'address' }
    ],
    name: 'createBookmakerMarket',
    outputs: [{ name: 'friendMarketId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'description', type: 'string' },
      { name: 'invitedMembers', type: 'address[]' },
      { name: 'memberLimit', type: 'uint256' },
      { name: 'tradingPeriod', type: 'uint256' },
      { name: 'arbitrator', type: 'address' },
      { name: 'acceptanceDeadline', type: 'uint256' },
      { name: 'minAcceptanceThreshold', type: 'uint256' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'stakeToken', type: 'address' }
    ],
    name: 'createSmallGroupMarketPending',
    outputs: [{ name: 'friendMarketId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },

  // Acceptance functions
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'acceptMarket',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'cancelPendingMarket',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'processExpiredDeadline',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },

  // Resolution functions
  {
    inputs: [
      { name: 'friendMarketId', type: 'uint256' },
      { name: 'outcome', type: 'bool' }
    ],
    name: 'resolveFriendMarket',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'challengeResolution',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'finalizeResolution',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'claimWinnings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'challengePeriod',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'challengeBond',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'wagerWinner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'friendMarketId', type: 'uint256' }],
    name: 'winningsClaimed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },

  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'member', type: 'address' }
    ],
    name: 'MemberAdded',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'acceptanceDeadline', type: 'uint256' },
      { indexed: false, name: 'stakePerParticipant', type: 'uint256' },
      { indexed: false, name: 'opponentOddsMultiplier', type: 'uint16' },
      { indexed: false, name: 'stakeToken', type: 'address' },
      { indexed: false, name: 'invitedParticipants', type: 'address[]' },
      { indexed: false, name: 'arbitrator', type: 'address' }
    ],
    name: 'MarketCreatedPending',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'participant', type: 'address' },
      { indexed: false, name: 'stakedAmount', type: 'uint256' },
      { indexed: false, name: 'acceptedAt', type: 'uint256' }
    ],
    name: 'ParticipantAccepted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'arbitrator', type: 'address' },
      { indexed: false, name: 'acceptedAt', type: 'uint256' }
    ],
    name: 'ArbitratorAccepted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: false, name: 'underlyingMarketId', type: 'uint256' },
      { indexed: false, name: 'activatedAt', type: 'uint256' },
      { indexed: false, name: 'totalStaked', type: 'uint256' },
      { indexed: false, name: 'participantCount', type: 'uint256' }
    ],
    name: 'MarketActivated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'cancelledAt', type: 'uint256' }
    ],
    name: 'MarketCancelledByCreator',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'participant', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ],
    name: 'StakeRefunded',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'resolver', type: 'address' },
      { indexed: false, name: 'outcome', type: 'bool' }
    ],
    name: 'MarketResolved',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'proposer', type: 'address' },
      { indexed: false, name: 'proposedOutcome', type: 'bool' },
      { indexed: false, name: 'challengeDeadline', type: 'uint256' }
    ],
    name: 'ResolutionProposed',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'challenger', type: 'address' },
      { indexed: false, name: 'bondAmount', type: 'uint256' }
    ],
    name: 'ResolutionChallenged',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: false, name: 'outcome', type: 'bool' }
    ],
    name: 'ResolutionFinalized',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'friendMarketId', type: 'uint256' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'token', type: 'address' }
    ],
    name: 'WinningsClaimed',
    type: 'event'
  }
]

export default FRIEND_GROUP_MARKET_FACTORY_ABI
