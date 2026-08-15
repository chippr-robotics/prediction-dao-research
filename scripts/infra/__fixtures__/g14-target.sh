#!/usr/bin/env bash
# G-14 violation: -target applies a subgraph without refreshing the rest.
terraform apply -target=module.network.google_compute_firewall.allow_cloudflare
