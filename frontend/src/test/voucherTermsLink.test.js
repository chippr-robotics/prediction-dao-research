import { describe, it, expect } from 'vitest'
import { MEMBERSHIP_VOUCHERS_TERMS_PATH } from '../constants/legalLinks'
import termsRaw from '../legal/terms.md?raw'
import voucherPageSource from '../pages/VouchersPage.jsx?raw'

// Mirror of LegalDocPage's slugify so this test fails if the heading text and the
// deep-link anchor ever drift apart (the redeem checkbox links here).
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

describe('Membership Vouchers terms deep link', () => {
  it('is an in-app Terms anchor, not an external URL', () => {
    expect(MEMBERSHIP_VOUCHERS_TERMS_PATH).toBe('/terms#membership-vouchers')
    expect(MEMBERSHIP_VOUCHERS_TERMS_PATH.startsWith('/terms#')).toBe(true)
  })

  it('resolves to an actual heading in terms.md (anchor matches a slugified heading)', () => {
    const anchor = MEMBERSHIP_VOUCHERS_TERMS_PATH.split('#')[1]
    const headings = [...termsRaw.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => slugify(m[1]))
    expect(headings).toContain(anchor)
  })

  it('the redeem checkbox links to the shared voucher terms path', () => {
    expect(voucherPageSource).toContain('MEMBERSHIP_VOUCHERS_TERMS_PATH')
  })
})
