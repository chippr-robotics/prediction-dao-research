import './StagingBanner.css'

/**
 * Non-production environment marker (spec 076, FR-025/FR-026d).
 *
 * Shown only when VITE_STAGING_BANNER is set — production builds never set it, so this renders
 * nothing there and the bundle cost is a single string comparison.
 *
 * DELIBERATELY NOT DISMISSIBLE, unlike DevelopmentWarningBanner. Two reasons:
 *
 *  · FR-025 requires staging to be identifiable as non-production from within the app. A marker a
 *    member can dismiss stops satisfying that the moment they do.
 *  · On the MAINNET staging service the banner is also the real-funds disclosure (FR-026d). That
 *    service mirrors production against the live Polygon estate, so its transactions ARE real. A
 *    tester who dismissed the banner and then assumed a dry run would spend real money. Constitution
 *    III forbids implying a finality — or a safety — the system does not have.
 *
 * The two cohorts get materially different copy on purpose. "Test environment" would be true of
 * both and useful for neither.
 */

const COPY = {
  mainnet: {
    label: 'STAGING · MAINNET',
    detail: 'Pre-production build on the live Polygon estate. Transactions here are REAL and spend real funds.',
    tone: 'danger',
  },
  testnet: {
    label: 'STAGING · TESTNET',
    detail: 'Pre-production build on test networks (Amoy / Mordor). No real funds are at risk.',
    tone: 'info',
  },
}

// Not exported: a named export alongside the component breaks React fast-refresh, and nothing
// outside this file needs it.
function stagingMode() {
  const raw = import.meta.env?.VITE_STAGING_BANNER
  const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return mode === 'mainnet' || mode === 'testnet' ? mode : null
}

function StagingBanner() {
  const mode = stagingMode()
  if (!mode) return null

  const { label, detail, tone } = COPY[mode]
  return (
    <div
      className={`staging-banner staging-banner--${tone}`}
      role="status"
      data-testid="staging-banner"
      data-mode={mode}
    >
      <strong className="staging-banner__label">{label}</strong>
      <span className="staging-banner__detail">{detail}</span>
    </div>
  )
}

export default StagingBanner
