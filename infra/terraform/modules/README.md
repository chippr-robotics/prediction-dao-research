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
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/network?ref=<sha>"
  # ...
}
```

Pinned by **commit SHA**, not a branch. A branch ref would make a plan a function of when someone
last ran `init`. A SHA is also stricter than a tag, since a tag can be moved and a SHA cannot.

Guardrail **G-16** rejects any unpinned or branch-pinned module source.

## The repository is private

`terraform init` needs a credential to fetch it. The default `GITHUB_TOKEN` in Actions is scoped to
this repository only and **cannot** read the modules repo, so the infra workflows rewrite git's
config using `TF_MODULES_TOKEN` before `init`. If `init` reports `repository not found`, that is
almost always authentication rather than a wrong path — GitHub returns 404 rather than 403 for a
private repository the caller cannot see.

## Adding a module

Add it to `chippr-tf-modules`, not here. A module in this directory would be invisible to the other
projects and would drift from its shared twin — the thing extraction was meant to prevent.

A genuinely FairWins-only module can live here; it must still satisfy G-08 (no environment literals)
and G-09 (no `provider` blocks), which are still enforced against this directory.
