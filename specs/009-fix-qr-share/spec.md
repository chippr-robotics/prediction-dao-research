# Feature Specification: Fix QR Share & Scan Rendering

**Feature Branch**: `009-fix-qr-share`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "The QR share is currently not working. The same failure happens on the Share QR button from the /app screen (Your Wagers). The modal opens with a broken/missing image — only a warning triangle (broken-image icon) inside an otherwise empty modal — instead of a scannable QR code. Additionally, the QR icon is never present on the QR-scan button (next to the Opponent Address field on the create-wager form) — the button renders as a blank/empty box."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share a newly created wager by QR from the /app success screen (Priority: P1)

A member creates a wager from the "Your Wagers" area on `/app`. On the success screen they are shown a QR code so a friend can scan it and open the acceptance link. Today the QR area renders only a broken-image warning triangle, so the member has no working code to show and cannot invite anyone by scanning.

**Why this priority**: This is the exact flow the user reported and the primary way wagers are shared in person. A broken QR here blocks the core "create → invite friend → accept" loop and makes the product look broken at the most important moment (right after a successful on-chain action).

**Independent Test**: Create a wager and reach the success screen; confirm a scannable QR code is displayed (not a broken-image placeholder) and that scanning it opens the same acceptance link shown in the "Acceptance link" field.

**Acceptance Scenarios**:

1. **Given** a member has just created a wager and is viewing the success screen, **When** the QR section renders, **Then** a fully formed, scannable QR code is shown and no broken-image icon appears.
2. **Given** the displayed QR code, **When** a friend scans it with a standard phone camera, **Then** they are taken to the same acceptance URL shown in the "Acceptance link" field of the same screen.
3. **Given** the success screen, **When** the member cannot or does not want to use the QR, **Then** a working copy-link control is available as an alternative.

---

### User Story 2 - Share QR works consistently across every share surface (Priority: P1)

The same QR-share capability appears in more than one place (the create-wager success screen, the Share Wager modal, and the market Share modal). A member should get a working, scannable QR in every one of these surfaces, with consistent behavior.

**Why this priority**: The defect is shared across surfaces because they all render the QR the same way. Fixing only one surface would leave the others broken and produce inconsistent UX. Consistency across surfaces is required by the project's "Accessible, Consistent Frontend" standard.

**Independent Test**: Open each share surface in turn (create-wager success, Share Wager modal, market Share modal) and confirm each shows a scannable QR with no broken-image placeholder, and that each encodes the correct corresponding link.

**Acceptance Scenarios**:

1. **Given** the Share Wager modal is open for a wager, **When** it renders, **Then** a scannable QR for that wager's link is shown with no broken-image icon.
2. **Given** the market Share modal is open for a market, **When** it renders, **Then** a scannable QR for that market's link is shown with no broken-image icon.
3. **Given** any of the share surfaces, **When** the QR renders, **Then** the encoded link exactly matches the share/acceptance link displayed in that same surface.

---

### User Story 3 - QR stays usable even when the decorative brand logo can't load (Priority: P2)

The QR codes are decorated with a center brand logo. If that decorative logo cannot be loaded or embedded (slow network, mobile in-app webview, asset unavailable), the member must still see a complete, scannable QR — never a broken-image placeholder standing in for the whole code.

**Why this priority**: The observed failure presents as a broken-image icon, which points to the embedded/decorative image as a likely cause. Guaranteeing the QR survives a missing logo prevents the reported failure mode and any future regression of the same kind. It is P2 because it is a robustness guarantee layered on top of the core "QR renders" fix.

**Independent Test**: Simulate the brand logo being unavailable and confirm the QR still renders fully and remains scannable, with no broken-image icon shown to the user.

**Acceptance Scenarios**:

1. **Given** the decorative center logo cannot be loaded, **When** a share surface renders its QR, **Then** the QR is still complete and scannable and no broken-image placeholder is shown.
2. **Given** a scan of a QR rendered without the center logo, **When** a friend scans it, **Then** it still resolves to the correct link (the logo is decorative only and never required for scanning).

---

### User Story 4 - The QR-scan button shows its icon and lets users scan an address (Priority: P2)

On the create-wager form, the "Opponent Address" field has an adjacent button that opens a QR scanner so a member can scan a counterparty's address instead of typing it. Today that button renders as a blank/empty box — its QR icon is never visible — so members can't tell the scan affordance exists and won't use it.

**Why this priority**: The missing icon hides a useful affordance and makes the form look broken, but unlike the share-display defect it does not fully block the flow (an address can still be typed or pasted). It belongs in this fix because it is part of the same "QR isn't working" report and shares the underlying rendering/theming cause.

**Independent Test**: Open the create-wager form on a supported device/theme and confirm the QR-scan button next to the Opponent Address field shows a clearly visible QR icon (not a blank box), and that activating it opens the scanner.

**Acceptance Scenarios**:

1. **Given** the create-wager form is shown, **When** the Opponent Address row renders, **Then** the QR-scan button displays a visible QR icon with adequate contrast against its background.
2. **Given** the visible QR-scan button, **When** the member activates it, **Then** a QR scanner opens and a successfully scanned address populates the Opponent Address field.
3. **Given** the page is shown in any supported theme/context (e.g., light or dark background), **When** the QR-scan button renders, **Then** its icon remains visible and legible (never blank, never the same color as its background).

---

### Edge Cases

- **Decorative logo fails to load** (404, slow network, restrictive mobile webview): the QR must still render fully and scannably; no broken-image icon may appear in its place. This is the most likely cause of the reported defect.
- **Low contrast against the modal background**: the QR must remain scannable regardless of the modal's background color/theme (a code that is technically present but blends into a dark background is treated as a failure).
- **Theme-dependent icon color**: a QR-related control (e.g., the scan button) whose icon color is driven by the active theme must stay visible in every supported theme/context; an icon that resolves to the same (or near-same) color as its own background — rendering as a blank box — is treated as a failure.
- **Long encoded links** (e.g., encrypted/private wager acceptance links): the QR must still encode the full link and remain scannable at the displayed size.
- **Missing or not-yet-available link** (e.g., wager/market identifier not ready): the surface must show an explicit, friendly state rather than a broken or empty QR.
- **Browsers without clipboard or native-share support**: the copy-link/share fallback must degrade gracefully with a clear message, so sharing is still possible without the QR.
- **Mobile in-app webviews** (e.g., opened from a messaging app, as in the reported screenshot): QR rendering must work here, not only in desktop browsers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every share surface (create-wager success screen, Share Wager modal, and market Share modal) MUST display a fully formed, scannable QR code encoding the correct share/acceptance link.
- **FR-002**: The system MUST NOT, under any condition, display a broken-image placeholder (e.g., a warning-triangle icon) in place of the QR code.
- **FR-003**: The QR code MUST remain scannable by standard mobile camera and QR-reader apps — with adequate contrast and quiet zone — regardless of the surrounding modal's background color or theme.
- **FR-004**: The center brand logo on the QR MUST be treated as decorative and optional; if it cannot be loaded or embedded, the QR MUST still render in full and remain scannable.
- **FR-005**: The link encoded in the QR MUST exactly match the share/acceptance link shown to the user in the same surface (copy-link field or equivalent).
- **FR-006**: Each share surface MUST provide a working copy-link (and, where available, native-share) fallback so a member can share even when scanning is not possible.
- **FR-007**: QR rendering MUST function on supported mobile browsers and in-app webviews, not only desktop browsers, since the reported failure occurs on mobile.
- **FR-008**: When a valid share link cannot be produced (e.g., identifier unavailable), the surface MUST present an explicit, user-friendly message instead of a broken or blank QR.
- **FR-009**: The QR and its surrounding share controls MUST meet WCAG 2.1 AA, including an accessible name for the QR image and keyboard-operable controls, consistent with the project's frontend accessibility standard.
- **FR-010**: QR-share behavior MUST be consistent across all share surfaces (same rendering quality, same fallback behavior, same scannability guarantees).
- **FR-011**: The fix MUST remain within the existing client-side/no-backend footprint — QR generation continues to happen in the client with no new server-side dependency.
- **FR-012**: The QR-scan affordance (the button beside the Opponent Address field) MUST display a visible QR icon with adequate contrast against its own background in every supported theme/context, and MUST NOT render as a blank or empty control.
- **FR-013**: Activating the QR-scan affordance MUST open a QR scanner, and a successfully scanned address MUST populate the Opponent Address field.

### Key Entities *(include if feature involves data)*

- **Share Link**: The acceptance/market URL that the QR encodes and that the copy-link control exposes. It must be identical wherever it appears in a given surface (QR payload and visible link), and resolving it must open the correct wager/market.
- **Share Surface**: A UI location that offers QR sharing — currently the create-wager success screen, the Share Wager modal, and the market Share modal. All must exhibit identical QR-share guarantees.
- **QR-Scan Affordance**: The control (beside the Opponent Address field on the create-wager form) that opens a QR scanner to capture a counterparty's address. It must present a visible QR icon and, on a successful scan, fill the Opponent Address field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across all three share surfaces, 100% of QR renders display a complete code with zero broken-image placeholders on supported desktop and mobile devices.
- **SC-002**: A QR shown in any share surface scans successfully on the first attempt with a standard phone camera under normal lighting in at least 95% of attempts.
- **SC-003**: Scanning a displayed QR opens the exact link shown in the same surface's copy-link field 100% of the time.
- **SC-004**: With the decorative center logo unavailable, the QR still renders and scans successfully in 100% of attempts (zero broken renders attributable to the missing logo).
- **SC-005**: New bug reports about "QR share not working" / broken QR image drop to zero in the release following the fix.
- **SC-006**: Automated tests verify, for each of the three surfaces, that a scannable QR is present, that no broken-image placeholder is rendered, that the encoded link matches the displayed link, and that the QR survives the logo being unavailable.
- **SC-007**: The QR-scan button displays a visible, legible QR icon in 100% of supported themes/contexts (zero blank-button renders), and activating it opens the scanner.

## Assumptions

- The reported failure was observed in a mobile (Android/Samsung) browser or in-app webview per the attached screenshot; the fix must cover mobile and in-app webviews as well as desktop.
- The in-scope QR surfaces are: the three QR *display* surfaces (the create-wager success screen on the "Your Wagers"/`/app` flow, the Share Wager modal, and the market Share modal), plus the QR-*scan* button next to the Opponent Address field on the create-wager form. All four are reported under the same "QR isn't working" issue.
- The QR-scan button's missing icon is treated as a theme/contrast defect (its icon color tracks the active theme and currently resolves to near-invisible against its background on the live page), not a missing asset; the fix must guarantee visibility across themes rather than depend on a particular theme being active.
- The center brand logo overlaid on the QR is decorative; replacing, simplifying, or removing it is acceptable if doing so guarantees the QR renders and remains scannable.
- Standard QR scannability requirements apply: dark-on-light module contrast and an adequate quiet zone, presented at a size large enough to scan from a phone held at arm's length.
- No app backend may be added (existing no-backend footprint); QR generation stays client-side.
- Out of scope: redesigning the share modals' layout or copy beyond what is required to make the QR render and scan reliably, and adding new share channels (e.g., email, social, additional deep-link formats) beyond those already present.
