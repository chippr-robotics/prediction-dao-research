import { useMemo } from 'react'
import blockies from 'ethereum-blockies-base64'
import './BlockiesAvatar.css'

/**
 * BlockiesAvatar - A deterministic visual representation of an Ethereum address
 * Uses ethereum-blockies-base64 to generate a unique identicon for each wallet address
 * 
 * @param {string} address - The Ethereum wallet address
 * @param {number} size - The size of the avatar in pixels (default: 40)
 * @param {string} className - Additional CSS classes
 * @param {string} alt - Alt text for the image (defaults to shortened address)
 */
function BlockiesAvatar({ address, size = 40, className = '', alt }) {
  // Generate the blockies image data URL
  const blockiesDataUrl = useMemo(() => {
    if (!address) return null
    return blockies(address)
  }, [address])

  // Default alt text
  const altText = alt || (address ? `Avatar for ${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Wallet avatar')

  if (!blockiesDataUrl) {
    // Fallback to a default avatar if no address is provided
    return (
      <div 
        className={`blockies-avatar blockies-avatar-fallback ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Default wallet avatar"
      >
        👤
      </div>
    )
  }

  return (
    <img
      src={blockiesDataUrl}
      alt={altText}
      className={`blockies-avatar ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export default BlockiesAvatar
