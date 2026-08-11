# Quickstart: Nav Drawer Density (spec 081)

## See it

```bash
npm run frontend            # http://localhost:5173
```

Open the app and click the clover logo (mobile) or the rail's hamburger (desktop ≥769px).

- **Sections fold.** Quick Access and Finance start open; Tools starts folded. Click a heading to
  toggle it; the choice is remembered on this device.
- **Pinned apps are a strip.** Pin apps from **Tools ▸ Apps** ("Add to My Apps"). They appear as a
  single row of tiles carrying the app's store artwork, capped at 5 with a "Show all N (+K)" link.
- **Filter.** Type in the field at the top of the drawer; it matches pinned apps and section items
  alike, and shows matches even inside folded sections.
- **Density.** *Account button ▸ Settings ▸ Menu density* → Compact.

## Reset the preferences

Both live in the device-scoped `fw_global_prefs` blob and are never synced:

```js
// devtools console
const p = JSON.parse(localStorage.fw_global_prefs || '{}')
delete p.nav_sections; delete p.nav_density
localStorage.fw_global_prefs = JSON.stringify(p)
```

## Test it

```bash
cd frontend
npx vitest run \
  src/test/navPreferences.test.js \
  src/test/AppNavDrawer.test.jsx \
  src/test/AppNavDrawer.sections.test.jsx \
  src/test/AppNavDrawer.pinned.test.jsx \
  src/test/AppNavDrawer.search.test.jsx \
  src/test/AppNavDrawer.density.test.jsx \
  src/test/AppNavDrawer.axe.test.jsx \
  src/test/PortalNav.test.jsx \
  src/test/miniapps/navigation.test.jsx
npx eslint src/components/nav src/components/ui/PortalNav.jsx src/lib/nav
```

Do **not** run the unfiltered frontend suite locally — it OOMs this environment (see `CLAUDE.md`).

## Re-capture the screenshots

```bash
npm run dev --workspace frontend -- --port 5199        # terminal 1
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright  # once
cd <repo root>
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-nav-drawer.mjs
```

Output lands in `specs/081-nav-drawer-density/screenshots/`. Playwright is deliberately resolved
from outside the repo — see research R8.
