# Social & Image — One Action, One Role: RBAC and the Operations Control Plane

## X (Twitter)

Your on-chain access control is only as good as your admin dashboard. We found a compliance permission that existed on the blockchain but not in the operator's screen — so the tab was hidden behind full admin. How FairWins fixed it: one action, one role, contract to console. 🔗 <link> #web3 #accesscontrol #security

## LinkedIn

Least privilege dies quietly: not when a contract is exploited, but when an operator gets handed a bigger role "just so the tab shows up."

While auditing its own controls, FairWins found exactly that. Our compliance block-list was guarded on-chain by a dedicated, narrow permission — correct and auditable. But the admin dashboard didn't know that permission existed, so the block-list screen required full administrator access. The compliance officer couldn't reach her own tool without being handed the keys to everything.

The new post covers how we rebuilt both halves:

- The permission inventory: one membership members buy, and six clearly bounded operator roles, all built on a standard, audited access-control library — no homegrown permission system
- The "one action, one role" discipline, including the negative-space table of what each role explicitly cannot do
- The admin console that mirrors it: each screen shown only to operators who hold the exact permission its actions require
- What deliberately stays off the console: air-gapped upgrade keys, and a relay service with no remote admin controls by design

If you run privileged operations against smart contracts, the reusable idea is simple: model every on-chain permission in your operator UI, or watch over-granting erode your least-privilege design.

Read it here: <link>

How does your team keep operator dashboards in sync with real permissions?

#smartcontracts #accesscontrol #web3 #platformengineering #security

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a central translucent control room floating above a stylized blockchain grid, composed of eight distinct glowing panels arranged around a command console, each panel connected by a single luminous line to its own uniquely shaped key hovering below — visualizing "one action, one role." Each key fits exactly one lock on one panel; one warm amber key-and-panel pair stands out among cool-toned counterparts to suggest a compliance officer reaching her dedicated tool. Deep navy and teal base palette with a single warm amber accent, soft volumetric lighting from the upper left, subtle circuit-line texture in the background, generous negative space, precise geometric shapes with slight depth and soft shadows, fintech-engineering brand mood, no text, no logos, no watermarks. Aspect ratio 16:9.
