import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'
import { isValidEthereumAddress } from '../../utils/validation'
import { useNotification } from '../../hooks/useUI'

// parseEther throws on strings a number input can still produce (scientific
// notation like "1e-6", trailing "."), and an uncaught throw would take down
// the whole control plane — normalize to null and let callers surface it.
function safeParseEther(value) {
  try {
    const parsed = ethers.parseEther(String(value || '0'))
    return parsed > 0n ? parsed : null
  } catch {
    return null
  }
}

/**
 * PaymasterOpsCard — FairWinsVerifyingPaymaster operations (spec 050).
 *
 * The EntryPoint deposit IS the sponsorship loss cap: monitoring and topping
 * it up is a routine operator duty (docs/runbooks/paymaster-operations.md).
 * `deposit()` is deliberately permissionless on-chain (anyone may top up);
 * `withdrawTo` / `setVerifyingSigner` are owner-only — the buttons stay
 * visible so any operator can see the controls exist, but the transaction
 * reverts unless the connected wallet is the paymaster owner.
 */
const PAYMASTER_ABI = [
  'function getDeposit() view returns (uint256)',
  'function verifyingSigner() view returns (address)',
  'function owner() view returns (address)',
  'function deposit() payable',
  'function withdrawTo(address payable to, uint256 amount)',
  'function setVerifyingSigner(address newSigner)',
]

function shortAddr(a) {
  return a ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : ''
}

function PaymasterOpsCard({ signer, account, provider, chainId, nativeSymbol, runTx, pendingTx }) {
  const paymasterAddr = getContractAddressForChain('verifyingPaymaster', chainId)
  const { showNotification } = useNotification()

  const [info, setInfo] = useState({ deposit: null, verifyingSigner: '', owner: '' })
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawForm, setWithdrawForm] = useState({ to: '', amount: '' })
  const [newSigner, setNewSigner] = useState('')

  const readContract = useMemo(() => {
    if (!paymasterAddr || !provider) return null
    return new ethers.Contract(paymasterAddr, PAYMASTER_ABI, provider)
  }, [paymasterAddr, provider])

  const fetchInfo = useCallback(async () => {
    if (!readContract) return
    try {
      const [deposit, vSigner, owner] = await Promise.all([
        readContract.getDeposit().catch(() => null),
        readContract.verifyingSigner().catch(() => ''),
        readContract.owner().catch(() => ''),
      ])
      setInfo({ deposit, verifyingSigner: vSigner, owner })
    } catch (err) {
      console.warn('[PaymasterOpsCard] read failed:', err)
    }
  }, [readContract])

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  if (!paymasterAddr) {
    return (
      <div className="admin-card">
        <div className="admin-card-header"><h3>Sponsored-Gas Paymaster</h3></div>
        <p className="card-info">
          No verifying paymaster is deployed on this network. Sponsorship (spec 050) is
          Polygon-only; the passkey path self-funds elsewhere.
        </p>
      </div>
    )
  }

  const isOwner = account && info.owner && account.toLowerCase() === info.owner.toLowerCase()
  const write = () => new ethers.Contract(paymasterAddr, PAYMASTER_ABI, signer)

  const handleDeposit = () => {
    const value = safeParseEther(depositAmount)
    if (value == null) return showNotification(`Enter a valid ${nativeSymbol} amount`, 'error')
    runTx(
      () => write().deposit({ value }),
      `Deposited ${depositAmount} ${nativeSymbol} to the paymaster's EntryPoint balance`
    ).then(fetchInfo)
  }

  const handleWithdraw = () => {
    if (!isValidEthereumAddress(withdrawForm.to)) return showNotification('Invalid recipient address', 'error')
    const amount = safeParseEther(withdrawForm.amount)
    if (amount == null) return showNotification(`Enter a valid ${nativeSymbol} amount`, 'error')
    runTx(
      () => write().withdrawTo(withdrawForm.to, amount),
      `Withdrew ${withdrawForm.amount} ${nativeSymbol} from the paymaster deposit`
    ).then(fetchInfo)
  }

  const handleRotateSigner = () => {
    if (!isValidEthereumAddress(newSigner)) return showNotification('Invalid signer address', 'error')
    runTx(
      () => write().setVerifyingSigner(newSigner),
      `Verifying signer rotated to ${shortAddr(newSigner)}`
    ).then(fetchInfo)
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>Sponsored-Gas Paymaster</h3>
        <button type="button" className="refresh-btn" onClick={fetchInfo} aria-label="Refresh paymaster state">↻</button>
      </div>
      <div className="status-details">
        <div className="status-row">
          <span className="status-label">EntryPoint deposit (loss cap)</span>
          <span className="status-value">
            {info.deposit == null ? '—' : `${ethers.formatEther(info.deposit)} ${nativeSymbol}`}
          </span>
        </div>
        <div className="status-row">
          <span className="status-label">Verifying signer</span>
          <span className="status-value"><code>{shortAddr(info.verifyingSigner) || '—'}</code></span>
        </div>
        <div className="status-row">
          <span className="status-label">Owner</span>
          <span className="status-value">
            <code>{shortAddr(info.owner) || '—'}</code>{isOwner ? ' (you)' : ''}
          </span>
        </div>
      </div>

      <div className="admin-form">
        <label>
          Top up deposit ({nativeSymbol}) — permissionless, funds sponsorship runway
          <input type="number" min="0" step="0.01" value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)} />
        </label>
        <button className="confirm-btn primary" onClick={handleDeposit}
          disabled={pendingTx || !signer || !depositAmount}>
          {pendingTx ? 'Processing...' : 'Deposit'}
        </button>
      </div>

      <div className="admin-form">
        <label>
          Withdraw to (owner only)
          <input type="text" placeholder="0x…" value={withdrawForm.to}
            onChange={(e) => setWithdrawForm({ ...withdrawForm, to: e.target.value })} />
        </label>
        <label>
          Amount ({nativeSymbol})
          <input type="number" min="0" step="0.01" value={withdrawForm.amount}
            onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
        </label>
        <button className="confirm-btn danger" onClick={handleWithdraw}
          disabled={pendingTx || !signer || !isOwner || !withdrawForm.to || !withdrawForm.amount}>
          {pendingTx ? 'Processing...' : 'Withdraw Deposit'}
        </button>
      </div>

      <div className="admin-form">
        <label>
          Rotate verifying signer (owner only — incident response for a compromised KMS signer)
          <input type="text" placeholder="0x… new signer" value={newSigner}
            onChange={(e) => setNewSigner(e.target.value)} />
        </label>
        <button className="confirm-btn danger" onClick={handleRotateSigner}
          disabled={pendingTx || !signer || !isOwner || !newSigner}>
          {pendingTx ? 'Processing...' : 'Rotate Signer'}
        </button>
      </div>
      <p className="card-info">
        A compromised verifying signer can only spend deposit on gas — it cannot withdraw.
        Full procedure: docs/runbooks/paymaster-operations.md.
      </p>
    </div>
  )
}

export default PaymasterOpsCard
