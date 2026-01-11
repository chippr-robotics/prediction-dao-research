/**
 * MarketCorrelationRegistry ABI
 *
 * Registry for grouping related prediction markets together.
 * Enables correlation groups for markets like election candidates,
 * sports tournaments, or any related set of predictions.
 */

export const MARKET_CORRELATION_REGISTRY_ABI = [
  // View Functions
  {
    inputs: [],
    name: 'groupCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'correlationGroups',
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'creator', type: 'address' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'active', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'groupCategory',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'getGroupMarkets',
    outputs: [{ name: 'marketIds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'getMarketGroup',
    outputs: [{ name: 'groupId', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'category', type: 'string' }],
    name: 'getGroupsByCategory',
    outputs: [{ name: 'groupIds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'isMarketInGroup',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'getGroupMarketCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },

  // Write Functions
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'category', type: 'string' }
    ],
    name: 'createCorrelationGroup',
    outputs: [{ name: 'groupId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'marketId', type: 'uint256' }
    ],
    name: 'addMarketToGroup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'marketId', type: 'uint256' }],
    name: 'removeMarketFromGroup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'deactivateGroup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'groupId', type: 'uint256' }],
    name: 'reactivateGroup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '_roleManager', type: 'address' }],
    name: 'setRoleManager',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },

  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'groupId', type: 'uint256' },
      { indexed: false, name: 'name', type: 'string' },
      { indexed: false, name: 'description', type: 'string' },
      { indexed: false, name: 'category', type: 'string' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'createdAt', type: 'uint256' }
    ],
    name: 'CorrelationGroupCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'groupId', type: 'uint256' },
      { indexed: true, name: 'marketId', type: 'uint256' },
      { indexed: false, name: 'addedAt', type: 'uint256' }
    ],
    name: 'MarketAddedToGroup',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'groupId', type: 'uint256' },
      { indexed: true, name: 'marketId', type: 'uint256' },
      { indexed: false, name: 'removedAt', type: 'uint256' }
    ],
    name: 'MarketRemovedFromGroup',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'groupId', type: 'uint256' },
      { indexed: false, name: 'deactivatedAt', type: 'uint256' }
    ],
    name: 'CorrelationGroupDeactivated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'groupId', type: 'uint256' },
      { indexed: false, name: 'reactivatedAt', type: 'uint256' }
    ],
    name: 'CorrelationGroupReactivated',
    type: 'event'
  }
]

export default MARKET_CORRELATION_REGISTRY_ABI
