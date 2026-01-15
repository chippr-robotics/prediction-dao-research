import { useState } from 'react'
import { TIER_COLORS, TIER_NAMES } from '../../hooks/useRoleDetails'
import './RoleDetailsCard.css'

/**
 * Human-readable role names
 */
const ROLE_DISPLAY_NAMES = {
  MARKET_MAKER: 'Market Maker',
  FRIEND_MARKET: 'Friend Markets',
  CLEARPATH_USER: 'ClearPath',
  TOKENMINT: 'TokenMint'
}

/**
 * Role descriptions
 */
const ROLE_DESCRIPTIONS = {
  MARKET_MAKER: 'Create prediction markets with liquidity pools',
  FRIEND_MARKET: 'Create private 1v1 and group markets with friends',
  CLEARPATH_USER: 'Access to ClearPath analytics',
  TOKENMINT: 'Create custom tokens'
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return 'N/A'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * RoleDetailsCard - Displays detailed information about a user's role
 */
export function RoleDetailsCard({ role, onUpgrade, onExtend, compact = false }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!role) return null

  const {
    roleName,
    tier,
    tierName,
    tierColor,
    isActive,
    isExpired,
    daysRemaining,
    expirationDate,
    marketsCreated,
    marketLimit,
    canCreateMarket
  } = role

  const displayName = ROLE_DISPLAY_NAMES[roleName] || roleName
  const description = ROLE_DESCRIPTIONS[roleName] || ''

  // Determine status
  const isAtLimit = marketLimit > 0 && !canCreateMarket
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0
  const needsAttention = isExpired || isAtLimit || isExpiringSoon

  if (compact) {
    return (
      <div
        className={`role-card-compact ${needsAttention ? 'needs-attention' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="role-card-header">
          <div className="role-tier-badge" style={{ backgroundColor: tierColor }}>
            {tierName}
          </div>
          <span className="role-name">{displayName}</span>
          {isExpired && <span className="role-status expired">Expired</span>}
          {isAtLimit && !isExpired && <span className="role-status at-limit">At Limit</span>}
          {isExpiringSoon && !isExpired && !isAtLimit && (
            <span className="role-status expiring-soon">{daysRemaining}d left</span>
          )}
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>&#9660;</span>
        </div>

        {isExpanded && (
          <div className="role-card-details">
            {expirationDate && (
              <div className="detail-row">
                <span className="detail-label">Expires:</span>
                <span className={`detail-value ${isExpired ? 'expired' : ''}`}>
                  {formatDate(expirationDate)}
                  {daysRemaining !== null && daysRemaining > 0 && ` (${daysRemaining} days)`}
                </span>
              </div>
            )}
            {marketLimit > 0 && (
              <div className="detail-row">
                <span className="detail-label">Markets:</span>
                <span className={`detail-value ${isAtLimit ? 'at-limit' : ''}`}>
                  {marketsCreated} / {marketLimit} this month
                </span>
              </div>
            )}
            <div className="role-card-actions">
              {tier < 4 && onUpgrade && (
                <button
                  className="role-action-btn upgrade"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUpgrade(roleName)
                  }}
                >
                  Upgrade
                </button>
              )}
              {(isExpiringSoon || isExpired) && onExtend && (
                <button
                  className="role-action-btn extend"
                  onClick={(e) => {
                    e.stopPropagation()
                    onExtend(roleName)
                  }}
                >
                  {isExpired ? 'Renew' : 'Extend'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Full card view
  return (
    <div className={`role-card ${needsAttention ? 'needs-attention' : ''}`}>
      <div className="role-card-header">
        <div className="role-tier-badge" style={{ backgroundColor: tierColor }}>
          {tierName}
        </div>
        <div className="role-info">
          <h4 className="role-name">{displayName}</h4>
          <p className="role-description">{description}</p>
        </div>
      </div>

      <div className="role-card-body">
        {/* Expiration */}
        {expirationDate && (
          <div className="role-stat">
            <span className="stat-label">Expires</span>
            <span className={`stat-value ${isExpired ? 'expired' : isExpiringSoon ? 'warning' : ''}`}>
              {isExpired ? 'Expired' : formatDate(expirationDate)}
            </span>
            {!isExpired && daysRemaining !== null && (
              <span className={`stat-sublabel ${isExpiringSoon ? 'warning' : ''}`}>
                {daysRemaining} days remaining
              </span>
            )}
          </div>
        )}

        {/* Market Creation Usage */}
        {marketLimit > 0 && (
          <div className="role-stat">
            <span className="stat-label">Markets This Month</span>
            <div className="usage-bar-container">
              <div
                className={`usage-bar ${isAtLimit ? 'at-limit' : ''}`}
                style={{ width: `${Math.min(100, (marketsCreated / marketLimit) * 100)}%` }}
              />
            </div>
            <span className={`stat-value ${isAtLimit ? 'at-limit' : ''}`}>
              {marketsCreated} / {marketLimit}
            </span>
            {isAtLimit && (
              <span className="stat-sublabel warning">
                Limit reached - upgrade for more
              </span>
            )}
          </div>
        )}

        {/* Status Messages */}
        {isExpired && (
          <div className="role-alert expired">
            Your {displayName} access has expired. Renew to continue creating markets.
          </div>
        )}
        {isAtLimit && !isExpired && (
          <div className="role-alert at-limit">
            You've reached your monthly limit. Upgrade your tier for higher limits.
          </div>
        )}
        {isExpiringSoon && !isExpired && !isAtLimit && (
          <div className="role-alert expiring-soon">
            Your access expires in {daysRemaining} days. Extend now to avoid interruption.
          </div>
        )}
      </div>

      <div className="role-card-actions">
        {tier < 4 && onUpgrade && (
          <button
            className="role-action-btn upgrade"
            onClick={() => onUpgrade(roleName)}
          >
            Upgrade to {TIER_NAMES[tier + 1]}
          </button>
        )}
        {(isExpiringSoon || isExpired) && onExtend && (
          <button
            className="role-action-btn extend"
            onClick={() => onExtend(roleName)}
          >
            {isExpired ? 'Renew Access' : 'Extend Membership'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * RoleDetailsSection - Displays all roles in a section
 */
export function RoleDetailsSection({
  roleDetails,
  loading,
  onUpgrade,
  onExtend,
  onPurchase,
  onRefresh
}) {
  const activeRoles = Object.values(roleDetails || {}).filter(r => r.hasRole)
  const hasNoRoles = activeRoles.length === 0

  if (loading) {
    return (
      <div className="roles-loading">
        <span className="loading-spinner" />
        Loading roles...
      </div>
    )
  }

  if (hasNoRoles) {
    return (
      <div className="roles-empty">
        <p>No active roles</p>
        <button className="purchase-roles-btn" onClick={onPurchase}>
          Get Premium Access
        </button>
      </div>
    )
  }

  return (
    <div className="role-details-section">
      <div className="roles-header">
        <span className="section-title">Your Roles</span>
        {onRefresh && (
          <button
            className="refresh-btn"
            onClick={onRefresh}
            title="Refresh from blockchain"
          >
            &#8635;
          </button>
        )}
      </div>
      <div className="roles-list">
        {activeRoles.map((role) => (
          <RoleDetailsCard
            key={role.roleName}
            role={role}
            onUpgrade={onUpgrade}
            onExtend={onExtend}
            compact
          />
        ))}
      </div>
    </div>
  )
}

export default RoleDetailsCard
