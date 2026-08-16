# Quickstart: validating the Chippr brand alignment

How to prove this feature works. Run in order — each step's failure mode is different, and running
them out of order makes a lockfile problem look like a codemod problem.

## Prerequisites

```bash
node -v        # 20+
git rev-parse --abbrev-ref HEAD    # claude/fairwins-chippr-branding-doqie6
```

## 1. Dependency health (run this first, and alone)

Spec 075: adding dependencies re-resolves the lockfile, and this repo has repeatedly lost the
platform binary that every Vite build needs.

```bash
npm run check:deps
```

**Expected**: pass. If it fails on a missing optional platform binary, do **not** run
`npm install` — it reports "up to date" and changes nothing. Run `npm run deps:reinstall`.

## 2. The guards

Two Vitest tests are the machine-checkable half of the spec.

```bash
npx vitest run src/test/brand/ --root frontend
```

**Expected**: both pass.

- `noLegacyBrandColors.test.js` — fails listing `file:line` for any retired or outgoing brand hue in
  shipped styling (FR-002, FR-003, FR-005 → SC-001).
- `tokenContrast.test.js` — parses the shipped tokens and asserts every declared foreground/background
  pairing in [contracts/color-tokens.md](./contracts/color-tokens.md), in **both** themes
  (FR-016–018 → SC-002).

**To confirm the guards are real**, revert one literal and re-run:

```bash
# temporarily reintroduce a banned hue
sed -i 's/var(--brand-primary)/#36B37E/' frontend/src/App.css
npx vitest run src/test/brand/noLegacyBrandColors.test.js --root frontend   # MUST fail
git checkout -- frontend/src/App.css
```

A guard that has never been red is not evidence.

## 3. The mark is untouched

```bash
git diff --stat origin/main -- frontend/public/assets/
```

**Expected**: empty (FR-019, FR-020 → SC-004).

## 4. Tenant integrity

```bash
npm run tenants:validate
npx vitest run src/test/tenantConfig.test.js --root frontend
```

**Expected**: pass. The default tenant's declared theme matches `theme.css`; a tenant that overrides
tokens still wins over the defaults (FR-021).

## 5. Frontend suite

```bash
npm run test:frontend
```

**Expected**: no new failures versus the branch point (SC-005).

Locally, scope runs — the full suite OOMs this environment. Only CI runs it unfiltered.

## 6. Build

```bash
npx vite build --mode development --root frontend
```

**Expected**: succeeds. `npm run build` fails locally on a deliberate `VITE_PINATA_JWT` guard; that
is not a break.

## 7. Actor-critic screenshots (FR-023 → SC-003)

Operator-scoped Playwright — never a workspace dependency.

```bash
# once per session
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright

# dev server on a dedicated port
npm run dev --workspace frontend -- --port 5199 --strictPort &

# capture
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-brand.mjs
```

**Expected**: every scenario × {desktop 1280×900, mobile 390×844} × {light, dark} written to
`specs/089-chippr-brand-alignment/screenshots/`.

Then read every PNG and judge against the critic checklist:

1. **Legible** — every control visibly a control; contrast holds in *both* themes. Watch for chrome
   that depended on the old background.
2. **Functional** — real state, not a placeholder that could hide a broken read.
3. **Honest** — success / warning / error / destructive are mutually distinguishable, and none is
   carried by color alone (FR-008, FR-009).
4. **On-brand** — no green or blue survivors; teal ladder present; headings in the display face,
   body in the text face, addresses in mono; Amber only on alerts and live states, never filling a
   large area (FR-007).
5. **Composed** — nothing clipped, no horizontal scroll, mobile content fits.

Record findings in `screenshots/README.md`, fix, and **re-run the whole matrix** — a fix for one cell
can regress another. Exit when a full round produces zero findings.

## 8. Manual spot checks the harness cannot cover

- **Font failure path (FR-013)**: block the font files in devtools and reload. Text must stay legible
  in the fallback and layout must not break.
- **Installed PWA (FR-022)**: install to home screen; the OS chrome takes the Chippr-aligned theme
  color, not the old green.
- **Generated statement (FR-022)**: download a statement; accents are on-palette.

## Definition of done

| Check | Command |
|---|---|
| Dependencies healthy | `npm run check:deps` |
| No legacy brand literals | `npx vitest run src/test/brand/noLegacyBrandColors.test.js --root frontend` |
| Contrast AA both themes | `npx vitest run src/test/brand/tokenContrast.test.js --root frontend` |
| Mark unchanged | `git diff --stat origin/main -- frontend/public/assets/` |
| Tenants intact | `npm run tenants:validate` |
| Suite green | `npm run test:frontend` |
| Builds | `npx vite build --mode development --root frontend` |
| Screenshots clean | `specs/089-chippr-brand-alignment/screenshots/README.md` shows a zero-finding round |
