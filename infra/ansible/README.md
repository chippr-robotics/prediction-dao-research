# infra/ansible — node configuration for the FairWins nodes

Terraform creates the nodes; Ansible keeps their interiors true. The boundary is published in
`specs/086-infrastructure-as-code/contracts/ownership-boundary.md` — every attribute has exactly one
owner.

## Reaching the nodes

**There is no public SSH.** The firewall opens `:22` to `35.235.240.0/20` (the IAP TCP forwarding
range) and nothing else; `:443/:80` are open to Cloudflare ranges only. `inventory/gcp.yml` proxies
every connection through `gcloud compute start-iap-tunnel`.

If a playbook cannot connect, **fix the tunnel — never the firewall.** A playbook written for direct
SSH cannot reach these hosts at all, and widening the source range to make it work would undo the
network's whole posture.

```bash
gcloud auth login
ansible-galaxy collection install -r requirements.yml
ansible-inventory -i inventory/gcp.yml --graph      # both nodes, discovered by label
```

## Running

```bash
ansible-playbook site.yml --check --diff    # dry run
ansible-playbook site.yml                   # converge both nodes, one at a time
ansible-playbook playbooks/gateway.yml      # one role
ansible-playbook playbooks/harden.yml       # OS hardening + patching, deliberately separate
```

`site.yml` runs `serial: 1`: both nodes carry the gasless path, so converging them simultaneously
would mean any restart takes both down at once.

## Idempotency

A second consecutive run against an unchanged node reports `changed=0` and restarts nothing. This is
asserted in CI, not assumed. Two rules keep it true:

- **`state: present`, never `state: latest`.** `latest` reports changed whenever upstream publishes,
  and can upgrade Docker under a running bundler. The engine is version-pinned *and* apt-held.
- **No `shell`/`command` without `creates`, `removes`, or a truthful `changed_when`.**

## Things that will bite you

- **Restart the whole unit, never a container.** Every container on a node shares one network
  namespace (`network_mode: service:<owner>`), reproducing Cloud Run's sidecar namespace. That is
  what makes the `localhost` couplings correct verbatim — `ENGINE_URL`, `REDIS_URL`, the engine's
  webhook URL, and the alto upstream. Recreating the namespace owner invalidates the joiners, so
  acting on one container leaves a stack that looks healthy and is not. The webhook URL is the worst
  case: rewriting it wrong fails **silently**, and intents report `submitted` forever.
- **Secrets are delivered by `infra/vm/common/fetch-secrets.sh`, which this layer invokes rather
  than replaces.** That script enforces per-container scoping, byte-exact payloads (escaping a PEM
  newline breaks KMS signing silently, at first use), refusal to run under `set -x`, and
  REQUIRED-vs-OPTIONAL handling. Reimplementing it in Ansible would mean re-earning all four.
- **Version pins are load-bearing.** `relay-webhook-secret` and `relay-engine-api-key` are pinned to
  version `2`. Both have an enabled v1 *and* v2 today, so "unpinned means latest, and latest is v2"
  is benign right now and silently wrong after the next rotation.
- **The Cloudflare Origin CA certificate is the one genuinely manual step.** It is issued per-origin
  and is not derivable from the repository. nginx is deliberately left stopped without it, because
  starting it would fail and leave it down anyway.
- **The prober allowlist comes from the committed file**, the same one that backs the GCP firewall
  rule. The old startup script regenerated it from `gcloud` on every boot, so it could change with no
  review. Two allowlists that must agree will eventually disagree unless they come from one file.
