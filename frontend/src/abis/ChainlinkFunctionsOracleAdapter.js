// Auto-generated from artifacts/contracts/oracles/ChainlinkFunctionsOracleAdapter.sol/ChainlinkFunctionsOracleAdapter.json
// Regenerate by re-running scripts/deploy/deploy.js (recompiles) then copying ABI.
export const CHAINLINK_FUNCTIONS_ORACLE_ADAPTER_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "admin",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_router",
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
    "name": "InvalidResponseLength",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MarketAlreadyLinked",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyRouterCanFulfill",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RequestAlreadyPending",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RouterHasNoCode",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownRequestId",
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
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
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
        "internalType": "bytes32",
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "requestId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "err",
        "type": "bytes"
      }
    ],
    "name": "RequestFailed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "id",
        "type": "bytes32"
      }
    ],
    "name": "RequestFulfilled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "id",
        "type": "bytes32"
      }
    ],
    "name": "RequestSent",
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
        "name": "requestId",
        "type": "bytes32"
      }
    ],
    "name": "ResolutionRequested",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "acceptOwnership",
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
    "name": "conditionToPendingRequest",
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
        "internalType": "bytes32",
        "name": "sourceHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "encodedRequest",
        "type": "bytes"
      },
      {
        "internalType": "uint64",
        "name": "subscriptionId",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "gasLimit",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "donId",
        "type": "bytes32"
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
        "name": "",
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
    "stateMutability": "pure",
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
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "requestId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "response",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "err",
        "type": "bytes"
      }
    ],
    "name": "handleOracleFulfillment",
    "outputs": [],
    "stateMutability": "nonpayable",
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
        "name": "encodedRequest",
        "type": "bytes"
      },
      {
        "internalType": "bytes32",
        "name": "sourceHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "subscriptionId",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "gasLimit",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "donId",
        "type": "bytes32"
      }
    ],
    "name": "registerCondition",
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
    "name": "requestResolution",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "requestId",
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
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "requestToCondition",
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
    "inputs": [],
    "name": "router",
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
        "name": "to",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
