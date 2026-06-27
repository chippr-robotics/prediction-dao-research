// ZKWagerPool ABI (spec 034)
// Mirrored from the compiled artifact (contracts/pools/ZKWagerPool.sol). Keep in sync with the contract.
export const ZK_WAGER_POOL_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyJoined",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadValue",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DeadlineNotPassed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "IndexOOB",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInitialization",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "JoinClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MatrixSumMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoProposal",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotCreator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInitializing",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NothingToRefund",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NullifierMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OutcomeMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PoolFull",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RecipientNotBound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ResolutionWindowClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ResolutionWindowOpen",
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
    "name": "WrongScope",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongState",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "proposalId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "nullifier",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "message",
        "type": "uint256"
      }
    ],
    "name": "Approved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "shareRef",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Claimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "version",
        "type": "uint64"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "identityCommitment",
        "type": "uint256"
      }
    ],
    "name": "Joined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "frozenDenominator",
        "type": "uint32"
      }
    ],
    "name": "JoiningClosedEvent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "proposalId",
        "type": "bytes32"
      }
    ],
    "name": "OutcomeLocked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "proposalId",
        "type": "bytes32"
      }
    ],
    "name": "OutcomeProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "PoolCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "member",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Refunded",
    "type": "event"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "merkleTreeDepth",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "merkleTreeRoot",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nullifier",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "message",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "scope",
            "type": "uint256"
          },
          {
            "internalType": "uint256[8]",
            "name": "points",
            "type": "uint256[8]"
          }
        ],
        "internalType": "struct ISemaphore.SemaphoreProof",
        "name": "proof",
        "type": "tuple"
      }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "buyIn",
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
    "name": "cancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "claimNullifier",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }
        ],
        "internalType": "struct PayoutEntry[]",
        "name": "entries",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "merkleTreeDepth",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "merkleTreeRoot",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nullifier",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "message",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "scope",
            "type": "uint256"
          },
          {
            "internalType": "uint256[8]",
            "name": "points",
            "type": "uint256[8]"
          }
        ],
        "internalType": "struct ISemaphore.SemaphoreProof",
        "name": "proof",
        "type": "tuple"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "closeJoining",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "closedAt",
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
    "inputs": [],
    "name": "creator",
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
    "name": "currentProposalId",
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
    "name": "escrowTotal",
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
    "name": "factory",
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
    "name": "frozenDenominator",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupId",
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
    "name": "hasJoined",
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
        "name": "token_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "semaphore_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "groupId_",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "creator_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "buyIn_",
        "type": "uint256"
      },
      {
        "internalType": "uint32",
        "name": "maxMembers_",
        "type": "uint32"
      },
      {
        "internalType": "uint16",
        "name": "thresholdBips_",
        "type": "uint16"
      },
      {
        "internalType": "uint64",
        "name": "joinDeadline_",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "resolutionWindow_",
        "type": "uint64"
      }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "identityCommitment",
        "type": "uint256"
      }
    ],
    "name": "join",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "joinDeadline",
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
        "internalType": "uint256",
        "name": "identityCommitment",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "validAfter",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "validBefore",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "nonce",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "v",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "r",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "joinWithAuthorization",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lockedOutcome",
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
    "name": "maxMembers",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "memberCount",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pokeDeadline",
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
    "name": "proposalApprovals",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "proposalId",
        "type": "bytes32"
      }
    ],
    "name": "proposeOutcome",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "refund",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "refunded",
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
    "name": "resolutionWindow",
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
    "inputs": [],
    "name": "semaphore",
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
    "name": "state",
    "outputs": [
      {
        "internalType": "enum PoolState",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "thresholdBips",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "token",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]
