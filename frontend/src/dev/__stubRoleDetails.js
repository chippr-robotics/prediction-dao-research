/* Written by capture-agentic-access.mjs; deleted on exit.
   Poses the three membership states the API-access card is built around. `null` is the pending
   read (not an answer), `readable: false` is "the reference chain would not answer", and neither
   is the same as "not a member". */
const q = new URLSearchParams(window.location.search)
const mode = q.get('membership') || 'active'

const base = {
  roleName: 'WAGER_PARTICIPANT',
  tier: 0,
  tierName: 'None',
  tierColor: '#666',
  expiration: null,
  expirationDate: null,
  isActive: false,
  isExpired: false,
  daysRemaining: null,
  hasRole: false,
  readable: true,
}

const DETAILS = {
  pending: null,
  unreadable: { ...base, readable: false },
  none: { ...base },
  active: {
    ...base,
    tier: 1,
    tierName: 'Bronze',
    isActive: true,
    hasRole: true,
    daysRemaining: 203,
    expiration: 1804000000,
    expirationDate: new Date(1804000000000),
  },
}

export const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 }
export const TIER_NAMES = { 0: 'None', 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' }

export function useRoleDetails() {
  return {
    getRoleDetails: () => (mode in DETAILS ? DETAILS[mode] : DETAILS.active),
    roleDetails: {},
    loading: mode === 'pending',
    refresh: () => {},
  }
}
export default useRoleDetails
