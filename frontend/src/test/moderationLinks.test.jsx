import { describe, it, expect } from 'vitest'
import { ACCOUNT_MODERATION_PATH } from '../constants/legalLinks'
import modalSource from '../components/ui/PremiumPurchaseModal.jsx?raw'
import adminSource from '../components/AdminPanel.jsx?raw'
import roleSource from '../components/wallet/RoleDetailsCard.jsx?raw'

/**
 * Spec 010 (FR-002 / SC-002): every "Account Moderation policy" link points at the
 * in-app Terms section (/terms#account-moderation), never the external docs/marketing
 * site. Verified at the source level so the external URL cannot be reintroduced.
 */
const SURFACES = [
  ['PremiumPurchaseModal', modalSource],
  ['AdminPanel', adminSource],
  ['RoleDetailsCard', roleSource],
]

describe('Account Moderation policy links (Spec 010 — FR-002 / SC-002)', () => {
  it('the shared path is an in-app Terms anchor, not an external URL', () => {
    expect(ACCOUNT_MODERATION_PATH).toBe('/terms#account-moderation')
    expect(ACCOUNT_MODERATION_PATH.startsWith('/')).toBe(true)
  })

  it.each(SURFACES)('%s links the moderation policy in-app (no external docs URL)', (_name, src) => {
    expect(src).toContain('ACCOUNT_MODERATION_PATH')
    expect(src).not.toContain('/docs/system-overview/account-moderation')
  })
})
