/**
 * The "/" route.
 *
 * First-time visitors get the marketing page. Anyone this browser has already
 * attached an account for goes straight to the app, where the unlock prompt
 * meets them — "Launch App" is a step with no decision in it for a returning
 * member, and nothing in FairWins works until an account is connected.
 *
 * Escape hatches, both honoured for the rest of the tab session: "Leave" on the
 * entry gate, and /?stay=1.
 */

import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks/useWalletManagement'
import LandingPage from './LandingPage'
import { hasAcknowledged } from '../utils/entryGateAck'
import { hasWalletHistory, keepOnLanding, shouldStayOnLanding } from '../utils/appEntry'

export default function LandingRoute() {
  const { isConnected, connectionStatus } = useWallet()
  const { search } = useLocation()
  const askedToStay = new URLSearchParams(search).get('stay') === '1'

  useEffect(() => {
    if (askedToStay) keepOnLanding()
  }, [askedToStay])

  const stay = askedToStay || shouldStayOnLanding()
  // 'connecting'/'reconnecting' means a stored session is being restored — that
  // is a returning member even before isConnected flips.
  const restoring = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
  const returning = isConnected || restoring || hasWalletHistory()

  // Never forward past the eligibility gate: a visitor who has not entered yet
  // has to see it, and "Leave" must land somewhere that stays put.
  if (!stay && returning && hasAcknowledged()) return <Navigate to="/app" replace />

  return <LandingPage />
}
