# Social & Image — One Action, One Role: RBAC and the Operations Control Plane

## X (Twitter)

Your on-chain RBAC is only as good as your admin UI. We found a role (`SANCTIONS_ADMIN_ROLE`) that existed in Solidity but not in the frontend — so the operator's tab was gated on full admin. How FairWins fixed it: one action, one role, contract to console. 🔗 <link> #solidity #web3 #rbac

## LinkedIn

Least privilege dies quietly: not when a contract is exploited, but when an operator gets granted a bigger role "just so the tab shows up."

During FairWins' control-surface audit we found exactly that. Our compliance deny-list was gated on-chain by a dedicated `SANCTIONS_ADMIN_ROLE` — correct, narrow, auditable. But the frontend's role model didn't know the role existed, so the deny-list view required full `DEFAULT_ADMIN_ROLE`. The compliance officer couldn't reach her own tool without protocol-wide admin.

The new post covers how we rebuilt both halves:

- The role inventory: one user-purchasable role and six operator roles, all plain OpenZeppelin AccessControl `bytes32` hashes — no bespoke permission system
- The "one action, one role" discipline, including the negative-space table of what each role explicitly cannot do
- The `/admin` operations control plane: each view gated by the exact on-chain role its actions require, with a unit-testable pure-function nav model and per-contract grant routing
- What deliberately stays off the panel: air-gapped upgrade keys, and a relay gateway with no remote admin API by design

If you run privileged operations against smart contracts, the reusable idea is simple: model every on-chain role in your operator UI, or watch over-granting erode your least-privilege design.

Read it here: <link>

How does your team keep operator UIs in sync with on-chain roles?

#smartcontracts #solidity #accesscontrol #web3 #platformengineering

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a central translucent control room floating above a stylized blockchain grid, composed of eight distinct glowing panels arranged around a command console, each panel connected by a single luminous line to its own uniquely shaped key hovering below — visualizing "one action, one role." Each key fits exactly one lock on one panel; one warm amber key-and-panel pair stands out among cool-toned counterparts to suggest a compliance officer reaching her dedicated tool. Deep navy and teal base palette with a single warm amber accent, soft volumetric lighting from the upper left, subtle circuit-line texture in the background, generous negative space, precise geometric shapes with slight depth and soft shadows, fintech-engineering brand mood, no text, no logos, no watermarks. Aspect ratio 16:9.
