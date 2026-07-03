/**
 * The quick access card catalog (spec 038 US5) — shared by Dashboard.jsx
 * (which renders the cards, filtered by preference) and PreferencesPanel.jsx
 * (which lets the user toggle each card's visibility). Ids must match
 * Dashboard.jsx's QuickActionCard action ids exactly. Adding new quick access
 * cards is out of scope for this feature (see spec Assumptions) — if one is
 * ever added, list it here too so it becomes toggleable.
 */
export const QUICK_ACCESS_CARDS = [
  { id: 'create-1v1-friends', label: 'Friends Decide (1v1)' },
  { id: 'create-1v1-oracle', label: 'Oracle Settles (1v1)' },
  { id: 'create-offer', label: 'Make an Offer' },
  { id: 'open-challenge', label: 'Open Challenge' },
  { id: 'create-pool', label: 'Group Pool' },
  { id: 'enter-phrase', label: 'Enter a Phrase' },
  { id: 'my-wagers', label: 'My Wagers' },
  { id: 'scan-qr', label: 'Scan QR Code' },
  { id: 'share-account', label: 'Share Account' },
]
