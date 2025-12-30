import { ConnectButton } from 'thirdweb/react'
import { thirdwebClient, getThirdWebChain } from '../../thirdweb'
import './ThirdWebWalletButton.css'

/**
 * ThirdWeb ConnectButton wrapper component
 * Provides a modern, user-friendly wallet connection experience
 */
function ThirdWebWalletButton({ 
  className = '',
  theme = 'dark',
  btnTitle,
  modalTitle = 'Connect Wallet',
  modalSize = 'compact',
  welcomeScreen,
  showAllWallets = true
}) {
  const chain = getThirdWebChain()

  return (
    <div className={`thirdweb-wallet-button ${className}`}>
      <ConnectButton
        client={thirdwebClient}
        chain={chain}
        theme={theme}
        connectButton={{
          label: btnTitle || 'Connect Wallet',
        }}
        connectModal={{
          title: modalTitle,
          size: modalSize,
          welcomeScreen: welcomeScreen,
          showThirdwebBranding: false,
        }}
        wallets={showAllWallets ? undefined : [
          'io.metamask',
          'com.coinbase.wallet',
          'me.rainbow',
          'com.trustwallet.app',
        ]}
      />
    </div>
  )
}

export default ThirdWebWalletButton
