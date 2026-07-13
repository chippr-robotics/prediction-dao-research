/**
 * NavIcon — the flat, line-based icon set for the navigation surfaces (global
 * drawer, mobile section bar, account dropdown, admin sections). Replaces the
 * earlier emoji glyphs with a cohesive, professional set drawn on a 24×24 grid.
 *
 * Icons stroke with `currentColor` so they inherit the nav item's state colour
 * (muted at rest, brand green when active); the surrounding "glass" tile styling
 * lives in the consuming components' CSS.
 */
import './NavIcon.css'

// Path markup per icon name. Kept as fragments so every icon shares one <svg>
// shell (consistent stroke, sizing, and accessibility handling).
const ICON_PATHS = {
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.8V20h12V9.8" /><path d="M10 20v-4.5h4V20" /></>,
  trade: <><path d="M4 8h13" /><path d="m13 4 4 4-4 4" /><path d="M20 16H7" /><path d="m11 20-4-4 4-4" /></>,
  transfer: <><path d="M21.5 3 2.5 10.6l7 2.1 2.1 7L21.5 3Z" /><path d="M9.5 12.7 21.5 3" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  addressbook: <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M6 8H3.5M6 12H3.5M6 16H3.5" /><circle cx="12" cy="10" r="2.2" /><path d="M9 16c.6-1.9 5.4-1.9 6 0" /></>,
  backup: <><path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1A3.5 3.5 0 0 1 18 18H7Z" /><path d="M12 16v-5M10 13l2-2 2 2" /></>,
  reports: <><path d="M4 4v16h16" /><path d="M8 16v-3.5M12 16V9M16 16v-5.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15" r="1.2" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5S14.5 18.1 12 20.5C9.5 18.1 8.2 15.1 8.2 12S9.5 5.9 12 3.5Z" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" /></>,
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M14.5 9.3h-3.7a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.6v2.4M12 19v2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M2.6 12h2.4M19 12h2.4M5.1 18.9l1.7-1.7M17.2 6.8l1.7-1.7" /></>,
  ticket: <><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2 2 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2 2 0 0 0 0-5V7Z" /><path d="M14 5.5v13" strokeDasharray="1.5 2.5" /></>,
  sliders: <><path d="M4 7h8M16 7h4M4 12h4M12 12h8M4 17h6M14 17h6" /><circle cx="14" cy="7" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="12" cy="17" r="2" /></>,
  star: <><path d="m12 3.6 2.6 5.2 5.8.9-4.2 4.1 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.2-4.1 5.8-.9L12 3.6Z" /></>,
  key: <><circle cx="8" cy="12" r="3.5" /><path d="M11.3 11h8.9M17 11v3M20.2 11v2.4" /></>,
  power: <><path d="M12 3.5v8" /><path d="M6.8 7a8 8 0 1 0 10.4 0" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  alert: <><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v5M12 17.6v.01" /></>,
  layers: <><path d="M12 4 3 9l9 5 9-5-9-5Z" /><path d="m3 14 9 5 9-5" /></>,
  users: <><circle cx="9" cy="9" r="3" /><path d="M3.6 19c.9-3.4 9.9-3.4 10.8 0" /><path d="M16 6.3a3 3 0 0 1 0 5.4" /><path d="M18 13.6c2 .5 3.5 1.7 4 3.4" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6.2 6.2 11.6 11.6" /></>,
  shieldOff: <><path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m8.5 8.5 7 7" /></>,
  bank: <><path d="M3 9 12 4l9 5" /><path d="M4.5 9h15" /><path d="M6.5 9.5v7.5M10.5 9.5v7.5M13.5 9.5v7.5M17.5 9.5v7.5" /><path d="M3.5 20h17" /></>,
  broadcast: <><circle cx="12" cy="12" r="2" /><path d="M8.6 8.6a5 5 0 0 0 0 6.8M15.4 8.6a5 5 0 0 1 0 6.8M6.2 6.2a8.5 8.5 0 0 0 0 11.6M17.8 6.2a8.5 8.5 0 0 1 0 11.6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 6.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.8-4.2 12.2-4.2 13 0" /></>,
  trending: <><path d="M4 15.5 9.5 10l3.5 3.5L20 6" /><path d="M15.5 6H20v4.5" /></>,
  // Collectibles (spec 055) — a faceted gem: unique, collectible, display-worthy.
  gem: <><path d="M7 4h10l4 6-9 10L3 10l4-6Z" /><path d="M3 10h18" /><path d="M9.5 10 12 4l2.5 6L12 20l-2.5-10Z" /></>,
  // Earn (spec 050) — a sprouting seedling: assets at rest, growing.
  sprout: <><path d="M12 20v-7" /><path d="M12 13c0-3.3-2.7-6-6-6H4.5v.5c0 3.3 2.7 6 6 6H12" /><path d="M12 11c0-2.8 2.2-5 5-5h2.5v.5c0 2.8-2.2 5-5 5H12" /><path d="M7.5 20h9" /></>,
  // Share address as QR (spec 011 quick-share entry point) — the three QR
  // finder-pattern corners plus scattered data pixels, universally read as "QR".
  qrcode: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h3v3" /><path d="M20 14v.01" /><path d="M14 20v.01" /><path d="M20 20v.01" /><path d="M17 17v.01" /></>,
}

export default function NavIcon({ name, size = 18, className = '' }) {
  const paths = ICON_PATHS[name]
  if (!paths) return null
  return (
    <svg
      className={`nav-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  )
}
