import { useState, useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useWeb3 } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { getAllUsersWithRoles, getUserRoles } from '../utils/roleStorage'
import { isValidEthereumAddress } from '../utils/validation'
import './RoleManagementAdmin.css'

function RoleManagementAdmin() {
  const { hasRole, ROLES, ROLE_INFO, grantRoleToUser, revokeRoleFromUser } = useRoles()
  const { account } = useWeb3()
  const { showNotification } = useNotification()
  const [allUsers, setAllUsers] = useState({})
  const [selectedUser, setSelectedUser] = useState(null)
  const [newUserAddress, setNewUserAddress] = useState('')
  const [selectedRole, setSelectedRole] = useState(ROLES.CLEARPATH_USER)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('users')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(null)

  // Check if user has admin role
  const isAdmin = hasRole(ROLES.ADMIN)

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  const loadUsers = () => {
    const users = getAllUsersWithRoles()
    setAllUsers(users)
  }

  const handleGrantRole = () => {
    if (!newUserAddress || !selectedRole) {
      setErrorMessage('Please provide both wallet address and role')
      showNotification('Please provide both wallet address and role', 'error')
      return
    }

    // Validate Ethereum address
    if (!isValidEthereumAddress(newUserAddress)) {
      setErrorMessage('Invalid Ethereum address format')
      showNotification('Invalid Ethereum address format', 'error')
      return
    }

    const success = grantRoleToUser(newUserAddress.toLowerCase(), selectedRole)
    if (success) {
      const message = `Successfully granted ${ROLE_INFO[selectedRole].name} to ${shortenAddress(newUserAddress)}`
      setSuccessMessage(message)
      showNotification(message, 'success')
      setNewUserAddress('')
      loadUsers()
      setTimeout(() => setSuccessMessage(''), 5000)
    } else {
      const message = 'Failed to grant role. Please check permissions.'
      setErrorMessage(message)
      showNotification(message, 'error')
      setTimeout(() => setErrorMessage(''), 5000)
    }
  }

  const handleRevokeRole = (userAddress, role) => {
    setConfirmRevoke({ userAddress, role })
  }

  const confirmRevokeRole = () => {
    if (!confirmRevoke) return
    
    const { userAddress, role } = confirmRevoke
    const success = revokeRoleFromUser(userAddress, role)
    if (success) {
      const message = `Successfully revoked ${ROLE_INFO[role].name} from ${shortenAddress(userAddress)}`
      setSuccessMessage(message)
      showNotification(message, 'success')
      loadUsers()
      setTimeout(() => setSuccessMessage(''), 5000)
    } else {
      const message = 'Failed to revoke role. Please check permissions.'
      setErrorMessage(message)
      showNotification(message, 'error')
      setTimeout(() => setErrorMessage(''), 5000)
    }
    setConfirmRevoke(null)
  }

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const filteredUsers = Object.entries(allUsers).filter(([address]) => 
    address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleStats = () => {
    const stats = {}
    Object.values(ROLES).forEach(role => {
      stats[role] = 0
    })
    
    Object.values(allUsers).forEach(roles => {
      roles.forEach(role => {
        if (stats[role] !== undefined) {
          stats[role]++
        }
      })
    })
    
    return stats
  }

  if (!isAdmin) {
    return (
      <div className="role-admin-unauthorized">
        <div className="unauthorized-icon" aria-hidden="true">🔒</div>
        <h2>Access Denied</h2>
        <p>You need administrator privileges to access this page.</p>
      </div>
    )
  }

  const roleStats = getRoleStats()

  return (
    <div className="role-management-admin">
      <header className="admin-header">
        <div className="admin-header-content">
          <h1>Role Management</h1>
          <p className="admin-subtitle">Manage user roles and permissions</p>
        </div>
      </header>

      {successMessage && (
        <div className="message-banner success" role="alert">
          <span className="message-icon">✓</span>
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="message-banner error" role="alert">
          <span className="message-icon">⚠</span>
          {errorMessage}
        </div>
      )}

      {confirmRevoke && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Confirm Revoke Role</h3>
            <p>
              Are you sure you want to revoke <strong>{ROLE_INFO[confirmRevoke.role].name}</strong> from{' '}
              <code>{shortenAddress(confirmRevoke.userAddress)}</code>?
            </p>
            <div className="confirm-actions">
              <button onClick={confirmRevokeRole} className="confirm-yes-btn">
                Yes, Revoke
              </button>
              <button onClick={() => setConfirmRevoke(null)} className="confirm-no-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span className="tab-icon">👥</span>
          Users
        </button>
        <button
          className={`admin-tab ${activeTab === 'grant' ? 'active' : ''}`}
          onClick={() => setActiveTab('grant')}
        >
          <span className="tab-icon">➕</span>
          Grant Role
        </button>
        <button
          className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <span className="tab-icon">📊</span>
          Statistics
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'users' && (
          <div className="users-tab">
            <div className="search-section">
              <input
                type="search"
                placeholder="Search by wallet address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="admin-search-input"
                aria-label="Search users"
              />
            </div>

            <div className="users-list">
              {filteredUsers.length === 0 ? (
                <div className="empty-state">
                  <p>No users found</p>
                </div>
              ) : (
                filteredUsers.map(([address, roles]) => (
                  <div key={address} className="user-card">
                    <div className="user-header">
                      <div className="user-address-section">
                        <span className="user-address" title={address}>
                          {shortenAddress(address)}
                        </span>
                        {address.toLowerCase() === account?.toLowerCase() && (
                          <span className="current-user-badge">You</span>
                        )}
                      </div>
                      <span className="user-role-count">{roles.length} role{roles.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="user-roles">
                      {roles.map(role => (
                        <div key={role} className="user-role-tag">
                          <span className="role-name">{ROLE_INFO[role]?.name || role}</span>
                          <button
                            onClick={() => handleRevokeRole(address, role)}
                            className="revoke-btn"
                            aria-label={`Revoke ${role} from ${shortenAddress(address)}`}
                            title="Revoke role"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'grant' && (
          <div className="grant-tab">
            <div className="grant-form">
              <h3>Grant Role to User</h3>
              <div className="form-group">
                <label htmlFor="userAddress">Wallet Address</label>
                <input
                  id="userAddress"
                  type="text"
                  placeholder="0x..."
                  value={newUserAddress}
                  onChange={(e) => setNewUserAddress(e.target.value)}
                  className="admin-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="roleSelect">Role</label>
                <select
                  id="roleSelect"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="admin-select"
                >
                  {Object.entries(ROLE_INFO).map(([roleKey, roleInfo]) => (
                    <option key={roleKey} value={roleKey}>
                      {roleInfo.name} - {roleInfo.description}
                    </option>
                  ))}
                </select>
              </div>

              <button onClick={handleGrantRole} className="grant-role-btn">
                Grant Role
              </button>
            </div>

            <div className="role-info-cards">
              <h4>Available Roles</h4>
              {Object.entries(ROLE_INFO).map(([roleKey, roleInfo]) => (
                <div key={roleKey} className="role-info-card">
                  <div className="role-card-header">
                    <span className="role-card-name">{roleInfo.name}</span>
                    {roleInfo.premium && <span className="premium-indicator">Premium</span>}
                  </div>
                  <p className="role-card-description">{roleInfo.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-tab">
            <h3>Role Distribution</h3>
            <div className="stats-grid">
              {Object.entries(ROLE_INFO).map(([roleKey, roleInfo]) => (
                <div key={roleKey} className="stat-card">
                  <div className="stat-header">
                    <span className="stat-role-name">{roleInfo.name}</span>
                    {roleInfo.premium && <span className="stat-premium">Premium</span>}
                  </div>
                  <div className="stat-count">{roleStats[roleKey] || 0}</div>
                  <div className="stat-label">user{roleStats[roleKey] !== 1 ? 's' : ''}</div>
                  <p className="stat-description">{roleInfo.description}</p>
                </div>
              ))}
            </div>

            <div className="total-stats">
              <div className="total-stat">
                <span className="total-label">Total Users with Roles:</span>
                <span className="total-value">{Object.keys(allUsers).length}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RoleManagementAdmin
