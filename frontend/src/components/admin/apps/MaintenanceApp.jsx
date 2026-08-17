/**
 * Maintenance admin mini-app (spec 093) — re-hosts MaintenanceTab unchanged.
 *
 * Its own app, deliberately: maintenance calls are PERMISSIONLESS on-chain,
 * so any operator who can enter the operations area may run them, and this
 * app must not imply elevated status (spec FR-010 — the Control Room tile
 * renders it plain). Folding it into Protocol Config would either show that
 * tile to everyone or hide maintenance from operators without protocol
 * roles.
 *
 * The dashboard is the registry roster: where the WagerRegistry exists, i.e.
 * where there is anything to maintain. That is address-book config — exact —
 * and the view itself names the network every call acts on.
 */
import AdminAppShell from '../AdminAppShell'
import MaintenanceTab from '../MaintenanceTab'
import { adminAppById } from '../adminApps'
import { useAdminAccess } from '../useAdminAccess'
import { useAdminTx } from '../useAdminTx'
import { useWeb3 } from '../../../hooks/useWeb3'
import { getContractAddressForChain } from '../../../config/contracts'
import { networkName, estateNetworks } from '../../../lib/chains/estate'

const APP = adminAppById('maintenance')

function shortAddr(address) {
  return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : ''
}

function MaintenanceDashboard() {
  const rows = estateNetworks().map((n) => ({
    chainId: n.chainId,
    addr: getContractAddressForChain('wagerRegistry', n.chainId),
  }))
  const deployed = rows.filter((r) => Boolean(r.addr))

  return (
    <div className="overview-grid">
      <div className="admin-card full-width">
        <div className="admin-card-header"><h3>Where there is something to maintain</h3></div>
        <p className="card-info">
          Maintenance calls (expiring open wagers, running auto-resolution) are permissionless
          on-chain — running them costs you gas and needs no role. {deployed.length} of{' '}
          {rows.length} cohort networks carry a WagerRegistry.
        </p>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <caption className="sr-only">WagerRegistry deployment per cohort network</caption>
            <thead>
              <tr>
                <th scope="col">Network</th>
                <th scope="col">WagerRegistry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chainId}>
                  <td>{networkName(r.chainId)}</td>
                  <td>
                    {r.addr ? (
                      <code title={r.addr}>{shortAddr(r.addr)}</code>
                    ) : (
                      <span className="admin-table-absent">not deployed here</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function MaintenanceApp() {
  const access = useAdminAccess()
  const { signer, chainId } = useWeb3()
  const { runTx, pendingTx } = useAdminTx()

  const renderView = (viewId) => {
    if (viewId !== 'maintenance') return null
    return (
      <MaintenanceTab
        signer={signer}
        chainId={chainId}
        runTx={runTx}
        pendingTx={pendingTx}
      />
    )
  }

  return <AdminAppShell app={APP} access={access} dashboard={<MaintenanceDashboard />} renderView={renderView} />
}
