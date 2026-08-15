# Terraform modules — now shared

**These modules live in [`chippr-robotics/chippr-tf-modules`](https://github.com/chippr-robotics/chippr-tf-modules).**

`network`, `edge-node`, `cloud-run-service`, `cloudflare-zone` and `monitoring` were extracted there
so the other Chippr projects sharing this GCP estate can consume the same descriptions instead of
each maintaining a copy.

They moved **byte-identical** — verified with `cmp` at extraction and again against the fetched copy
after rewiring. That was the promise the module design rested on: no `provider` blocks, no hardcoded
project/region/zone, every environment value an input, every consumer coupling an output.

## Consuming them

```hcl
module "network" {
  source = "git::ssh://git@github.com/chippr-robotics/chippr-tf-modules.git//modules/network?ref=<sha>"
  # ...
}
```

Pinned by **commit SHA**, not a branch. A branch ref would make a plan a function of when someone
last ran `init`. A SHA is also stricter than a tag, since a tag can be moved and a SHA cannot.

Guardrail **G-16** rejects any unpinned or branch-pinned module source.

## The repository is private

`terraform init` needs a credential to fetch it: a **read-only deploy key** on
`chippr-tf-modules`, stored as the `TF_MODULES_SSH_KEY` repository secret, with module sources using
`git::ssh://git@github.com/...`.

A deploy key rather than a personal access token, chosen after a fine-grained PAT failed under every
credential form: a deploy key is scoped to exactly one repository, is unaffected by the
organisation's PAT policy, has no resource-owner concept (which is fixed at token creation and
invisible afterwards), no approval queue, and no expiry. None of that machinery applies to it.

The workflows pin GitHub's published host key rather than running `ssh-keyscan`, which is
trust-on-first-use — it accepts whatever answers on the day, including an interceptor.

## Adding a module

Add it to `chippr-tf-modules`, not here. A module in this directory would be invisible to the other
projects and would drift from its shared twin — the thing extraction was meant to prevent.

A genuinely FairWins-only module can live here; it must still satisfy G-08 (no environment literals)
and G-09 (no `provider` blocks), which are still enforced against this directory.
