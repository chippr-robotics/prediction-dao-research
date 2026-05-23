// Auto-generated from artifacts/contracts/oracles/UMAOptimisticOracleV3Adapter.sol/UMAOptimisticOracleV3Adapter.json
// Regenerate by re-running scripts/deploy/deploy.js (recompiles) then copying ABI.
export const UMA_OPTIMISTIC_ORACLE_V3_ADAPTER_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "admin",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_oo",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyResolved",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AssertionAlreadyPending",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ConditionAlreadyRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ConditionNotRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LivenessTooShort",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MarketAlreadyLinked",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OOHasNoCode",
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
    "name": "ReentrancyGuardReentrantCall",
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
    "name": "UnauthorizedCallback",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownAssertion",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "assertionId",
        "type": "bytes32"
      }
    ],
    "name": "AssertionDisputed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "assertionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "asserter",
        "type": "address"
      }
    ],
    "name": "AssertionMade",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "expectedResolutionTime",
        "type": "uint256"
      }
    ],
    "name": "ConditionRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "confidence",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "resolvedAt",
        "type": "uint256"
      }
    ],
    "name": "ConditionResolved",
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
    "name": "MarketLinked",
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
    "inputs": [],
    "name": "MIN_LIVENESS",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
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
      },
      {
        "internalType": "address",
        "name": "asserter",
        "type": "address"
      }
    ],
    "name": "assertResolution",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "assertionId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "assertionId",
        "type": "bytes32"
      }
    ],
    "name": "assertionDisputedCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "assertionId",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "assertedTruthfully",
        "type": "bool"
      }
    ],
    "name": "assertionResolvedCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "assertionToCondition",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "conditionToAssertion",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "conditions",
    "outputs": [
      {
        "internalType": "bytes",
        "name": "claim",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "bondCurrency",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "bondAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "liveness",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "registered",
        "type": "bool"
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
    "name": "getConditionMetadata",
    "outputs": [
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "expectedResolutionTime",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getConfiguredChainId",
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
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "getOutcome",
    "outputs": [
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "confidence",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "resolvedAt",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isAvailable",
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
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "isConditionResolved",
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
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "isConditionSupported",
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
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      }
    ],
    "name": "linkMarket",
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
    "name": "marketToCondition",
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
    "inputs": [],
    "name": "oo",
    "outputs": [
      {
        "internalType": "contract OptimisticOracleV3Interface",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oracleType",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "pure",
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
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "claim",
        "type": "bytes"
      },
      {
        "internalType": "address",
        "name": "bondCurrency",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "bondAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "liveness",
        "type": "uint64"
      }
    ],
    "name": "registerCondition",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "resolutionCache",
    "outputs": [
      {
        "internalType": "bool",
        "name": "outcome",
        "type": "bool"
      },
      {
        "internalType": "uint64",
        "name": "resolvedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint96",
        "name": "confidence",
        "type": "uint96"
      },
      {
        "internalType": "bool",
        "name": "exists",
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
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
