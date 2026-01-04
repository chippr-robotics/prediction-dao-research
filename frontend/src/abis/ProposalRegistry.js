/**
 * ProposalRegistry ABI
 * 
 * Essential functions for interacting with the proposal registry contract
 */
export const PROPOSAL_REGISTRY_ABI = [
  // Read functions
  {
    "inputs": [],
    "name": "getProposalCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "proposalId", "type": "uint256"}],
    "name": "getProposal",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "proposer", "type": "address"},
          {"name": "title", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "fundingAmount", "type": "uint256"},
          {"name": "status", "type": "uint8"},
          {"name": "createdAt", "type": "uint256"},
          {"name": "executedAt", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllProposals",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "proposer", "type": "address"},
          {"name": "title", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "fundingAmount", "type": "uint256"},
          {"name": "status", "type": "uint8"},
          {"name": "createdAt", "type": "uint256"},
          {"name": "executedAt", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "status", "type": "uint8"}],
    "name": "getProposalsByStatus",
    "outputs": [{"name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [
      {"name": "title", "type": "string"},
      {"name": "description", "type": "string"},
      {"name": "fundingAmount", "type": "uint256"}
    ],
    "name": "createProposal",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "proposalId", "type": "uint256"}],
    "name": "executeProposal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "proposalId", "type": "uint256"}],
    "name": "cancelProposal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "proposalId", "type": "uint256"},
      {"indexed": true, "name": "proposer", "type": "address"},
      {"indexed": false, "name": "title", "type": "string"},
      {"indexed": false, "name": "fundingAmount", "type": "uint256"}
    ],
    "name": "ProposalCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "proposalId", "type": "uint256"},
      {"indexed": false, "name": "status", "type": "uint8"}
    ],
    "name": "ProposalStatusChanged",
    "type": "event"
  }
]
