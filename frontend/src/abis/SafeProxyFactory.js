// Spec 043 — SafeProxyFactory (v1.4.1) ABI, hand-maintained. Used to deploy a new Safe vault: the initializer
// is an ABI-encoded call to Safe.setup(owners, threshold, to, data, fallbackHandler, paymentToken, payment,
// paymentReceiver). The resulting proxy address is deterministic (CREATE2) and previewable off-chain.

export const SAFE_PROXY_FACTORY_ABI = [
  'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
  'function proxyCreationCode() view returns (bytes)',
  'event ProxyCreation(address indexed proxy, address singleton)',
]

// The Safe singleton `setup` initializer (encoded and passed as `initializer` above).
export const SAFE_SETUP_ABI = [
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
]

export default SAFE_PROXY_FACTORY_ABI
