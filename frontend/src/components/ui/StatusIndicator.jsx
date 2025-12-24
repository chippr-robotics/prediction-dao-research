import styles from './StatusIndicator.module.css'

/**
 * StatusIndicator Component
 * 
 * Status indicator with icon and color for accessibility.
 * Never relies on color alone - always includes an icon.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {'active'|'pending'|'reviewing'|'cancelled'|'executed'|'forfeited'|'completed'|'failed'} props.status - Status type
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.customIcon - Override default icon
 * @param {string} props.customLabel - Override default label
 */
const StatusIndicator = ({ 
  status,
  className = '',
  customIcon,
  customLabel,
  ...props
}) => {
  const statusConfig = {
    active: { icon: '✓', label: 'Active', colorClass: styles['status-success'] },
    pending: { icon: '⏳', label: 'Pending', colorClass: styles['status-warning'] },
    reviewing: { icon: '👁', label: 'Reviewing', colorClass: styles['status-warning'] },
    cancelled: { icon: '⛔', label: 'Cancelled', colorClass: styles['status-danger'] },
    executed: { icon: '✅', label: 'Executed', colorClass: styles['status-success'] },
    forfeited: { icon: '❌', label: 'Forfeited', colorClass: styles['status-danger'] },
    completed: { icon: '✓', label: 'Completed', colorClass: styles['status-success'] },
    failed: { icon: '✗', label: 'Failed', colorClass: styles['status-danger'] }
  }

  const config = statusConfig[status] || statusConfig.pending
  const icon = customIcon || config.icon
  const label = customLabel || config.label
  
  const classes = `${styles['status-indicator']} ${config.colorClass} ${className}`.trim()

  return (
    <span className={classes} {...props}>
      <span className={styles['status-icon']} aria-hidden="true">{icon}</span>
      <span className={styles['status-label']}>{label}</span>
    </span>
  )
}

export default StatusIndicator
