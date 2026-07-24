# FairWins Feature Announcements

Member-facing launch posts for new FairWins capabilities. Where the
**[Engineering Blog](../posts/README.md)** explains *how* a system is built and the
**[Finance Professional Series](../finance/README.md)** maps it to traditional-finance
concepts, this series answers the member's question: **what's new, and how do I use it?**

Each announcement leads with the benefit, shows the exact flow (what you'll see before
you sign), and stays honest about fees, risks, and availability — the same "never imply
something the chain hasn't done" standard the product itself holds to.

## Structure

Each announcement lives in its own numbered directory with two files, mirroring the
Engineering Blog layout:

- `blog.md` — the announcement post.
- `social.md` — the promotion kit: an X (Twitter) post, a LinkedIn post, and a 16:9
  banner **image prompt** for Gemini / Nano Banana.

Swap the `<link>` placeholders in each `social.md` for the live post URL at publish time.

## Index

| # | Announcement | Area | Spec(s) | Status |
|---|--------------|------|---------|--------|
| 01 | [Put Your Idle Crypto to Work: Staking Comes to FairWins](01-staking/blog.md) · [social](01-staking/social.md) | Finance → Earn | 065, 066 | Draft |

## Adding an announcement

1. Create the next numbered directory: `NN-<slug>/`.
2. Add `blog.md` (benefit-first, honest-state, with a "Get started" flow) and `social.md`
   (X + LinkedIn + 16:9 image prompt).
3. Add a row to the Index table above (Area = the member surface it ships on; Spec(s) = the
   `specs/` feature numbers of record; Status = Draft → Published).
