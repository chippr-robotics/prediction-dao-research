/**
 * Shared legal/policy document links (Spec 010 — FR-002 / FR-006 / FR-009).
 *
 * Single source of truth for the in-app policy routes referenced by the footer
 * (Footer.jsx) and by the compliance surfaces that link to them (membership
 * purchase modal, admin freeze note, role-details card). Every href is an
 * IN-APP route — never the external marketing/docs site (SC-002).
 *
 * The Account Moderation policy is a section within the Terms document, reached
 * by the `#account-moderation` anchor (see legal/terms.md + LegalDocPage's
 * scroll-to-hash behavior).
 */

/** Deep link to the Account Moderation section inside the in-app Terms document. */
export const ACCOUNT_MODERATION_PATH = '/terms#account-moderation'

/** Deep link to the Membership Vouchers section inside the in-app Terms document. */
export const MEMBERSHIP_VOUCHERS_TERMS_PATH = '/terms#membership-vouchers'

/** Ordered policy/legal links shown in the footer (both variants). */
export const LEGAL_LINKS = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Risk Disclosure', href: '/risk' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Account Moderation', href: ACCOUNT_MODERATION_PATH },
]
