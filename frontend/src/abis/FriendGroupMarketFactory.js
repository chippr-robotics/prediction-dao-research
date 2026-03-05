export const FriendGroupMarketFactoryABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_marketFactory",
        "type": "address"
      },
      {
        "internalType": "address payable",
        "name": "_ragequitModule",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_tieredRoleManager",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_paymentManager",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_owner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AddressNullified",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyAccepted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyChallenged",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyClaimed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyPegged",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyPeggedToOracle",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyPeggedToPolymarket",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyTimedOut",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ChallengePeriodNotExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ClaimTimeoutNotExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DeadlineNotPassed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DeadlinePassed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DuplicateMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientChallengeBond",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientPayment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientPayment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidChallengeBond",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidChallengePeriod",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidClaimTimeout",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidConditionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDeadline",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDescription",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidLimit",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMarketId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidOdds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidOpponent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidOracleTimeout",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidResolutionType",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidStake",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidThreshold",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidTimestamp",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MarketLimitReached",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MemberLimitReached",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MembershipExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MembershipRequired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MissingMarketMakerRole",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotActive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAuthorized",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotChallenged",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInChallengePeriod",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInvited",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotMember",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOraclePegged",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotPegged",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotPending",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotPendingResolution",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotTimedOut",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotWinner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OracleConditionNotResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OracleRegistryNotSet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OracleTimeoutNotExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PolymarketAdapterNotSet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PolymarketNotResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RefundAlreadyAccepted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RefundNotInitiated",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TreasuryNotSet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WagerNotResolved",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "acceptedCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "requiredCount",
        "type": "uint256"
      }
    ],
    "name": "AcceptanceDeadlinePassed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "acceptedAt",
        "type": "uint256"
      }
    ],
    "name": "ArbitratorAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      }
    ],
    "name": "ArbitratorSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256[]",
        "name": "friendMarketIds",
        "type": "uint256[]"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "outcome",
        "type": "uint256"
      }
    ],
    "name": "BatchResolution",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldBond",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newBond",
        "type": "uint256"
      }
    ],
    "name": "ChallengeBondUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldPeriod",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newPeriod",
        "type": "uint256"
      }
    ],
    "name": "ChallengePeriodUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldTimeout",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newTimeout",
        "type": "uint256"
      }
    ],
    "name": "ClaimTimeoutUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "bondRecipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "bondAmount",
        "type": "uint256"
      }
    ],
    "name": "DisputeResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "expectedTime",
        "type": "uint256"
      }
    ],
    "name": "ExpectedResolutionTimeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "publicFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "friendFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oneVsOneFee",
        "type": "uint256"
      }
    ],
    "name": "FeesUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "underlyingMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum MarketType",
        "name": "marketType",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "memberLimit",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "creationFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "paymentToken",
        "type": "address"
      }
    ],
    "name": "FriendMarketCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldManager",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newManager",
        "type": "address"
      }
    ],
    "name": "ManagerUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "underlyingMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "activatedAt",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalStaked",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "participantCount",
        "type": "uint256"
      }
    ],
    "name": "MarketActivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "cancelledAt",
        "type": "uint256"
      }
    ],
    "name": "MarketCancelledByCreator",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stakePerParticipant",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "opponentOddsMultiplier",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address[]",
        "name": "invitedParticipants",
        "type": "address[]"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      }
    ],
    "name": "MarketCreatedPending",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      }
    ],
    "name": "MarketPegged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "oracleId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "MarketPeggedToOracle",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "MarketPeggedToPolymarket",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      }
    ],
    "name": "MarketPeggedToPublic",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "resolver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "MarketResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "MemberAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxSmallGroup",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxOneVsOne",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "minEventTracking",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxEventTracking",
        "type": "uint256"
      }
    ],
    "name": "MemberLimitsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "MemberRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalRefunded",
        "type": "uint256"
      }
    ],
    "name": "MutualRefundCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "initiator",
        "type": "address"
      }
    ],
    "name": "MutualRefundInitiated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bool",
        "name": "enforce",
        "type": "bool"
      }
    ],
    "name": "NullificationEnforcementUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "nullifierRegistry",
        "type": "address"
      }
    ],
    "name": "NullifierRegistryUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "oracleId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "OracleMarketResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "registry",
        "type": "address"
      }
    ],
    "name": "OracleRegistryUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "expectedTime",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "actualTime",
        "type": "uint256"
      }
    ],
    "name": "OracleTimeoutTriggered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldTimeout",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newTimeout",
        "type": "uint256"
      }
    ],
    "name": "OracleTimeoutUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "participant",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stakedAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "acceptedAt",
        "type": "uint256"
      }
    ],
    "name": "ParticipantAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "PaymentTokenAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "PaymentTokenRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "passValue",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "failValue",
        "type": "uint256"
      }
    ],
    "name": "PeggedMarketAutoResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "adapter",
        "type": "address"
      }
    ],
    "name": "PolymarketAdapterUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "passNumerator",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "failNumerator",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "PolymarketMarketResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "participant",
        "type": "address"
      }
    ],
    "name": "RefundAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "challenger",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "bondAmount",
        "type": "uint256"
      }
    ],
    "name": "ResolutionChallenged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "ResolutionFinalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "proposedOutcome",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "challengeDeadline",
        "type": "uint256"
      }
    ],
    "name": "ResolutionProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "participant",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "StakeRefunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "oldTreasury",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "newTreasury",
        "type": "address"
      }
    ],
    "name": "TreasuryUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "treasury",
        "type": "address"
      }
    ],
    "name": "UnclaimedFundsSwept",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "WinningsClaimed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "acceptMarket",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "acceptMutualRefund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "acceptedParticipantCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "acceptedPaymentTokens",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "acceptedTokenList",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "addAcceptedPaymentToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "newMember",
        "type": "address"
      }
    ],
    "name": "addMember",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "autoResolvePeggedMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      }
    ],
    "name": "batchAutoResolvePeggedMarkets",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "batchResolveFromPolymarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "cancelPendingMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "challengeBond",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "challengePeriod",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "challengeResolution",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimTimeout",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "claimWinnings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "opponent",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "tradingPeriod",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "opponentStakeAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint16",
        "name": "opponentOddsMultiplier",
        "type": "uint16"
      },
      {
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      },
      {
        "internalType": "enum ResolutionType",
        "name": "resolutionType",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      }
    ],
    "name": "createBookmakerMarket",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "opponent",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "tradingPeriod",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stakeAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      },
      {
        "internalType": "enum ResolutionType",
        "name": "resolutionType",
        "type": "uint8"
      }
    ],
    "name": "createOneVsOneMarketPending",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "address[]",
        "name": "invitedMembers",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "memberLimit",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "tradingPeriod",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minAcceptanceThreshold",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stakeAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      }
    ],
    "name": "createSmallGroupMarketPending",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "defaultCollateralToken",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "enforceNullification",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "expectedResolutionTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "finalizeResolution",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "forceOracleResolution",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "friendMarketCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "friendMarketFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "friendMarkets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "marketId",
        "type": "uint256"
      },
      {
        "internalType": "enum MarketType",
        "name": "marketType",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "memberLimit",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "creationFee",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "createdAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "peggedPublicMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "autoPegged",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "paymentToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "liquidityAmount",
        "type": "uint256"
      },
      {
        "internalType": "enum FriendMarketStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minAcceptanceThreshold",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stakePerParticipant",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tradingPeriodSeconds",
        "type": "uint256"
      },
      {
        "internalType": "uint16",
        "name": "opponentOddsMultiplier",
        "type": "uint16"
      },
      {
        "internalType": "enum ResolutionType",
        "name": "resolutionType",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "polymarketConditionId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAcceptedTokens",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "getFriendMarket",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "marketId",
        "type": "uint256"
      },
      {
        "internalType": "enum MarketType",
        "name": "marketType",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "members",
        "type": "address[]"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "memberLimit",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "creationFee",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "createdAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "peggedPublicMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "autoPegged",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "paymentToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "liquidityAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "getFriendMarketWithStatus",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "marketId",
        "type": "uint256"
      },
      {
        "internalType": "enum MarketType",
        "name": "marketType",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "members",
        "type": "address[]"
      },
      {
        "internalType": "address",
        "name": "arbitrator",
        "type": "address"
      },
      {
        "internalType": "enum FriendMarketStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "acceptanceDeadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "stakePerParticipant",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "stakeToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "acceptedCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minThreshold",
        "type": "uint256"
      },
      {
        "internalType": "uint16",
        "name": "opponentOddsMultiplier",
        "type": "uint16"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "enum ResolutionType",
        "name": "resolutionType",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "getFriendMarketsForPolymarketCondition",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "getMemberCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMyMarkets",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "participant",
        "type": "address"
      }
    ],
    "name": "getParticipantAcceptance",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "participant",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "stakedAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "acceptedAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "hasAccepted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isArbitrator",
            "type": "bool"
          }
        ],
        "internalType": "struct AcceptanceRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      }
    ],
    "name": "getPeggedFriendMarkets",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "getPolymarketConditionId",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "getStakeRequirements",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "opponentStake",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "creatorStake",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalPot",
        "type": "uint256"
      },
      {
        "internalType": "uint16",
        "name": "oddsMultiplier",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "participant",
        "type": "address"
      }
    ],
    "name": "hasAccepted",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "isMember",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "manager",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "marketAcceptances",
    "outputs": [
      {
        "internalType": "address",
        "name": "participant",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "stakedAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "acceptedAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "hasAccepted",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isArbitrator",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "marketFactory",
    "outputs": [
      {
        "internalType": "contract ConditionalMarketFactory",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "marketOracleCondition",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "marketOracleId",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "marketTotalStaked",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxEventTrackingMembers",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxOneVsOneMembers",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxSmallGroupMembers",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "memberCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minEventTrackingMembers",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nullifierRegistry",
    "outputs": [
      {
        "internalType": "contract NullifierRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oneVsOneFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oracleRegistry",
    "outputs": [
      {
        "internalType": "contract OracleRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oracleTimeout",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paymentManager",
    "outputs": [
      {
        "internalType": "contract MembershipPaymentManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "oracleId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "pegToOracleCondition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "pegToPolymarketCondition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "publicMarketId",
        "type": "uint256"
      }
    ],
    "name": "pegToPublicMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "pendingResolutions",
    "outputs": [
      {
        "internalType": "bool",
        "name": "proposedOutcome",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "proposedAt",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "challengeDeadline",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "challenger",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "challengeBondPaid",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "polymarketAdapter",
    "outputs": [
      {
        "internalType": "contract PolymarketOracleAdapter",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "polymarketConditionToFriendMarkets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "processExpiredDeadline",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "publicMarketFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "publicMarketToPeggedFriendMarkets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ragequitModule",
    "outputs": [
      {
        "internalType": "contract RagequitModule",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "refundAcceptanceCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "refundAccepted",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "removeAcceptedPaymentToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "removeSelf",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "resolveDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      }
    ],
    "name": "resolveFriendMarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "resolveFromOracle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "resolveFromPolymarket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "resolvedAt",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_challengeBond",
        "type": "uint256"
      }
    ],
    "name": "setChallengeBond",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_challengePeriod",
        "type": "uint256"
      }
    ],
    "name": "setChallengePeriod",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_claimTimeout",
        "type": "uint256"
      }
    ],
    "name": "setClaimTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_collateralToken",
        "type": "address"
      }
    ],
    "name": "setDefaultCollateralToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "setExpectedResolutionTime",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bool",
        "name": "_enforce",
        "type": "bool"
      }
    ],
    "name": "setNullificationEnforcement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_nullifierRegistry",
        "type": "address"
      }
    ],
    "name": "setNullifierRegistry",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_oracleRegistry",
        "type": "address"
      }
    ],
    "name": "setOracleRegistry",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_oracleTimeout",
        "type": "uint256"
      }
    ],
    "name": "setOracleTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_polymarketAdapter",
        "type": "address"
      }
    ],
    "name": "setPolymarketAdapter",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_tieredRoleManager",
        "type": "address"
      }
    ],
    "name": "setTieredRoleManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      }
    ],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "sweepUnclaimedFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tieredRoleManager",
    "outputs": [
      {
        "internalType": "contract TieredRoleManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "friendMarketId",
        "type": "uint256"
      }
    ],
    "name": "triggerOracleTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_publicFee",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_friendFee",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_oneVsOneFee",
        "type": "uint256"
      }
    ],
    "name": "updateFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newManager",
        "type": "address"
      }
    ],
    "name": "updateManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_marketFactory",
        "type": "address"
      }
    ],
    "name": "updateMarketFactory",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_maxSmallGroup",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_maxOneVsOne",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_minEventTracking",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_maxEventTracking",
        "type": "uint256"
      }
    ],
    "name": "updateMemberLimits",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "_ragequitModule",
        "type": "address"
      }
    ],
    "name": "updateRagequitModule",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "wagerOutcome",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "wagerWinner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "winningsClaimed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
];

// Back-compat alias used by most importers
export const FRIEND_GROUP_MARKET_FACTORY_ABI = FriendGroupMarketFactoryABI;

// Enum mirrors for Solidity's ResolutionType
export const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5,
};
