---
name: actor-critic-screens
description: Validate a frontend surface visually with the actor-critic screenshot loop — capture real screenshots of the running app (both themes, both viewports), critique them against a concrete checklist, fix, and re-capture until clean. Use when a feature adds or reworks member-facing UI, when asked to "take screenshots" or "validate the screens", or before shipping a Protect/Recovery/Settings-style surface. Covers writing a capture harness from the repo's template and what the critic must actually check.
---

# Actor-critic screen validation

The **actor** renders the real surface in a real browser and writes PNGs. The **critic** (you)
reads every PNG and judges it against the checklist below. Findings become CSS/component fixes;
the loop repeats until a full capture round produces no findings. Final shots + a findings
README live in `specs/<feature>/screenshots/` — they are part of the feature's record, and the
README says what the loop *changed*, which is the evidence it ran.

Real precedents to copy: `scripts/ui/capture-verify.mjs` (spec 084) and
`scripts/ui/capture-protect-hardware.mjs` (spec 086), with their findings in
`specs/085-hardware-wallet-protect/screenshots/README.md`.

## Setting up (once per session)

```bash
# 1. Operator-scoped Playwright — NEVER a workspace dependency (spec 075: a screenshot
#    harness does not justify lockfile exposure). Chromium is pre-installed at /opt/pw-browsers.
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright

# 2. Dev server on a dedicated port (5199 keeps out of the way of 5173).
npm run dev --workspace frontend -- --port 5199 --strictPort &

# 3. Run a harness.
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-<feature>.mjs
```

## Writing the harness (the actor)

Copy an existing `scripts/ui/capture-*.mjs` and change the scenario list. The template gives you,
and every harness must keep:

- **The shot matrix**: every scenario × {desktop 1280×900, mobile 390×844} × {light, dark}.
  Theme is `localStorage.themeMode`. A bug can hide in exactly one cell — spec 086's invisible
  buttons existed only in light mode.
- **Network isolation**: `context.route` aborts everything that is not the dev server or the
  loopback stub chain. A shot must never quietly depend on the internet.
- **Real data over posed data**: stub at the app's own seams — `window.ethereum` (EIP-6963) for
  the wallet, the spec-069 member RPC override for chain reads, the DEV-only
  `window.__fwHardwareTestAdapter__` for hardware — so the screenshot shows the surface actually
  working. A hand-painted state photographs a different app than the one under test.
- **Banner suppression**: hide `.dev-warning-banner` and `.notification` (harness artifacts) via
  `addStyleTag`, never by changing app code.
- **One retry per shot** (dev-server HMR can re-mount mid-wait), then fail loudly.
- **Framing**: screenshot the panel element for page states, the full viewport for
  sheets/dialogs — whether a sheet fits one screen is exactly what is under review.

Seed state through storage the app actually reads (`fw_user_<addr>_<key>`, `fw_global_prefs`),
in `addInitScript` before the app boots.

## The critic checklist

Read every PNG (the Read tool renders images). For each, ask in order:

1. **Legible** — is every control visibly a control? Text ≥ readable size, contrast holds in BOTH
   themes? Watch specifically for chrome that depends on the background it used to sit on
   (the spec-085 finding: `--bg-secondary` buttons vanish on a card that is itself
   `--bg-secondary`-colored). Dark mode routinely masks light-mode bugs — never sign off from one
   theme.
2. **Functional** — does the shot show the surface *working* (real balances, real verdicts), or a
   placeholder that could hide a broken read? "—" where a number belongs is a finding unless the
   scenario poses the degraded state deliberately.
3. **Honest** — error states are stated sentences with a live retry, never a spinner or a bare
   disabled control; empty states say what to do next.
4. **Composed** — spacing consistent with neighboring surfaces, nothing clipped or overflowing,
   mobile sheet content fits one screen per step, no horizontal scroll.
5. **Complete** — is any state missing from the matrix that a member will actually see (empty,
   populated, error, in-flight)? A state the harness cannot fabricate honestly (real device, real
   Safe) is *documented as not photographed* in the README rather than faked.

Record findings in `specs/<feature>/screenshots/README.md` (shot table + what each round
changed), fix, and re-run the WHOLE matrix — a fix for one cell can regress another.

## Exit criteria

A capture round with zero critic findings, and a README that names the rounds and their fixes.
If the loop is still finding issues after three rounds, the problem is usually structural
(wrong container, wrong tokens) — stop patching pixels and read the CSS of the neighboring
surface the design should match.
