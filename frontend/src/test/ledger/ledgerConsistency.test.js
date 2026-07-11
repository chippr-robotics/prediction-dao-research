/**
 * Spec 051 T039 — FR-002 cross-surface consistency: no activity surface may
 * show a financial event that is absent from the ledger.
 *
 * Automated slice: every transfer the device log (Pay & Transfer Activity's
 * old backing store) knows about resolves to a ledger entry with the same
 * identity, status, and failure reason; every earn action captured beside the
 * notification buffer resolves to a ledger entry carrying the same txHash.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { recordTransfer, updateTransfer, listTransfers, __clearTransfers, TRANSFER_STATUS } from '../../lib/transfer/transferStore'
import { queueEarnAction, peekEarnActions } from '../../lib/earn/earnActivityBuffer'
import { captureEarnAction } from '../../data/ledger/sources/earnLedgerSource'
import { createTransferLedgerSource } from '../../data/ledger/sources/transferLedgerSource'
import { createEarnLedgerSource } from '../../data/ledger/sources/earnLedgerSource'
import { __clearClientLedger } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xAbc0000000000000000000000000000000000039'
const TX = '0x' + '39'.repeat(32)

beforeEach(() => {
  __clearTransfers()
  __clearClientLedger()
  localStorage.clear()
})

describe('cross-surface consistency (FR-002)', () => {
  it('every device-log transfer resolves to a ledger entry (incl. failures, verbatim reason)', async () => {
    const ok = recordTransfer(ACCOUNT, { chainId: 137, kind: 'stable', symbol: 'USC', decimals: 6, amount: '5', from: ACCOUNT, to: '0xd', route: 'gasless' })
    updateTransfer(ACCOUNT, ok.id, { status: TRANSFER_STATUS.COMPLETE, txHash: TX })
    const bad = recordTransfer(ACCOUNT, { chainId: 137, kind: 'native', symbol: 'MATIC', decimals: 18, amount: '0.01', from: ACCOUNT, to: '0xd', route: 'gasless' })
    updateTransfer(ACCOUNT, bad.id, { status: TRANSFER_STATUS.FAILED, error: 'Smart Account does not have sufficient funds to execute the User Operation.' })

    const source = createTransferLedgerSource()
    const entries = await source.list({ account: ACCOUNT, chainId: 137 })
    const byTransferId = new Map(entries.map((e) => [e.refs?.transferId, e]))

    for (const record of listTransfers(ACCOUNT, 137)) {
      const entry = byTransferId.get(record.id)
      expect(entry, `transfer ${record.id} missing from ledger`).toBeTruthy()
      if (record.status === TRANSFER_STATUS.FAILED) {
        expect(entry.status).toBe('failed')
        expect(entry.failureReason).toBe(record.error)
      }
    }
  })

  it('every earn action queued for the notification feed has a ledger entry with the same txHash', async () => {
    const action = {
      type: 'earn-deposit',
      refId: '0xvault',
      message: 'Deposited 5 USDC into Vault',
      txHash: TX,
      txUrl: null,
      at: Date.now(),
    }
    queueEarnAction(ACCOUNT, 137, action)
    captureEarnAction(ACCOUNT, 137, {
      type: action.type,
      txHash: action.txHash,
      at: action.at,
      vaultAddress: action.refId,
      amountRaw: '5000000',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    })

    const ledgerEntries = await createEarnLedgerSource().list({ account: ACCOUNT, chainId: 137 })
    for (const queued of peekEarnActions(ACCOUNT, 137)) {
      expect(
        ledgerEntries.some((e) => e.txHash === queued.txHash),
        `earn action ${queued.txHash} missing from ledger`,
      ).toBe(true)
    }
  })
})
