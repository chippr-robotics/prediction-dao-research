/* Written by capture-agentic-access.mjs; deleted on exit.
   The signer's signTypedData is bridged to Node, which answers with a REAL EIP-712 signature — so
   the token in the reveal shot is one the gateway would actually accept. */
const ACCOUNT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const signer = {
  address: ACCOUNT,
  getAddress: async () => ACCOUNT,
  signTypedData: async (domain, types, message) =>
    window.__fwSignTyped(JSON.stringify({ domain, types, message })),
}

const wallet = {
  address: ACCOUNT,
  account: ACCOUNT,
  isConnected: true,
  loginMethod: 'injected',
  chainId: 137,
  signer,
  provider: null,
  balances: {},
  hasRole: () => true,
}

export const useWallet = () => wallet
export const useWalletAddress = () => ({ address: ACCOUNT, account: ACCOUNT, isConnected: true })
export const useWalletBalances = () => ({ balances: {}, isLoading: false })
export default useWallet
