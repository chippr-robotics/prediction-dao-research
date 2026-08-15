# Module: `network`

Custom-mode VPC, regional subnet, static origin addresses, and the four ingress rules for one
region.

## Why custom mode

A custom-mode VPC gets **no default firewall rules**, so the project's `default-allow-ssh`
(0.0.0.0/0 on :22) and `default-allow-internal` (10.128.0.0/9, every port, no target tags — the same
network the public WordPress VM sits on) do not apply. There are no deny rules to get wrong, because
the default for unmatched ingress is already deny.

## Inputs

| Name | Type | Default | Notes |
|---|---|---|---|
| `project_id` | string | — | |
| `region` | string | — | |
| `network_name` | string | — | also the prefix for every firewall rule name |
| `subnet_name` | string | — | |
| `subnet_cidr` | string | `10.10.0.0/24` | |
| `static_ip_names` | list(string) | — | reserved and `prevent_destroy` protected |
| `edge_target_tags` | list(string) | `["fairwins-edge"]` | |
| `cloudflare_ipv4_ranges` | list(string) | — | from the `cloudflare_ip_ranges` data source |
| `cloudflare_ipv6_ranges` | list(string) | — | idem |
| `uptime_prober_cidrs` | list(string) | — | from the generated, staleness-gated list |
| `iap_forwarding_cidrs` | list(string) | `["35.235.240.0/20"]` | |

## Outputs

| Name | Notes |
|---|---|
| `network_id`, `network_name`, `subnet_id` | |
| `static_ips` | name → address; wire DNS from this, never from a literal |
| `static_ip_self_links` | name → self_link, for instance attachment |

## Resources created

`google_compute_network`, `google_compute_subnetwork`, `google_compute_address` (one per
`static_ip_names`), and four `google_compute_firewall` rules: Cloudflare v4, Cloudflare v6, uptime
probers, IAP SSH.

## Things that will bite you

- **The IAP SSH rule is Ansible's only route in.** The playbooks proxy through
  `gcloud compute start-iap-tunnel`. Removing this rule does not merely close SSH — it makes node
  configuration unreachable. If a playbook cannot connect, fix the tunnel, never the source range.
- **Uptime probers must reach the origin IP directly.** The Cloudflare geo gate answers 451 to
  US-sourced requests and Google's probers are largely US-based, so a check routed through
  Cloudflare is permanently red.
- **Static addresses are `prevent_destroy`.** Releasing and re-reserving yields a *different*
  address, breaking the Cloudflare origin. Changing `address_type` or `region` forces replacement and
  will also be blocked — deliberately.
- **Ranges are inputs, not data lookups.** A module that reaches out to a data source cannot be
  reasoned about by its caller and could not be extracted to a shared source.
