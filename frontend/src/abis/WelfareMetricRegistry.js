/**
 * WelfareMetricRegistry ABI
 * 
 * Essential functions for interacting with the welfare metric registry contract
 */
export const WELFARE_METRIC_REGISTRY_ABI = [
  // Read functions
  {
    "inputs": [],
    "name": "getMetricCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "metricId", "type": "uint256"}],
    "name": "getMetric",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "name", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "value", "type": "uint256"},
          {"name": "timestamp", "type": "uint256"},
          {"name": "active", "type": "bool"}
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
    "name": "getAllMetrics",
    "outputs": [
      {
        "components": [
          {"name": "id", "type": "uint256"},
          {"name": "name", "type": "string"},
          {"name": "description", "type": "string"},
          {"name": "value", "type": "uint256"},
          {"name": "timestamp", "type": "uint256"},
          {"name": "active", "type": "bool"}
        ],
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActiveMetrics",
    "outputs": [{"name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [
      {"name": "name", "type": "string"},
      {"name": "description", "type": "string"},
      {"name": "initialValue", "type": "uint256"}
    ],
    "name": "registerMetric",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "metricId", "type": "uint256"},
      {"name": "newValue", "type": "uint256"}
    ],
    "name": "updateMetric",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "metricId", "type": "uint256"},
      {"indexed": false, "name": "name", "type": "string"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "MetricRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "metricId", "type": "uint256"},
      {"indexed": false, "name": "oldValue", "type": "uint256"},
      {"indexed": false, "name": "newValue", "type": "uint256"}
    ],
    "name": "MetricUpdated",
    "type": "event"
  }
]
