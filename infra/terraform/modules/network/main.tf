/**
 * Dedicated custom-mode VPC, its subnet, the origin IPs, and the ingress rules.
 *
 * WHY CUSTOM MODE: a custom-mode VPC gets NO default firewall rules, so the project's
 * `default-allow-ssh` (0.0.0.0/0 on :22) and `default-allow-internal` (10.128.0.0/9, every port, no
 * target tags — the same network the public WordPress VM sits on) simply do not apply. There are no
 * deny rules to get wrong, because the default for unmatched ingress is already deny.
 *
 * Ranges are INPUTS, never fetched inside this module: a module that reaches out to a data source
 * cannot be reasoned about by its caller, and could not be extracted to a shared source.
 */

locals {
  # Firewall rule names are NOT derived from network_name. The live rules are `fairwins-allow-*`
  # while the network is `fairwins-infra`, and a derived name would not match what exists — which
  # on import reads as "create a new rule and leave the old one", and in a firewall means BOTH rules
  # stay in force. The prefix is therefore explicit.
  fw_prefix = coalesce(var.firewall_name_prefix, var.network_name)
}

resource "google_compute_network" "vpc" {
  name                    = var.network_name
  project                 = var.project_id
  auto_create_subnetworks = false
  description             = "FairWins gasless infrastructure. Custom mode: no default rules apply."
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.subnet_name
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.subnet_cidr

  # Lets the nodes reach Secret Manager, Artifact Registry and Logging without a public egress path.
  private_ip_google_access = true
}

/**
 * Static external addresses. An EPHEMERAL address changes on any stop/start, which would silently
 * break the Cloudflare origin — the DNS records in module `cloudflare-zone` are wired to these
 * outputs precisely so the two cannot desync.
 *
 * prevent_destroy: releasing one of these and re-reserving it yields a DIFFERENT address. Note that
 * changing `address_type` or `region` forces replacement, which this guard will also block — that
 * is intended, and such a change must be done deliberately, out of band.
 */
resource "google_compute_address" "origin" {
  for_each = toset(var.static_ip_names)

  name    = each.value
  project = var.project_id
  region  = var.region

  lifecycle {
    prevent_destroy = true
  }
}

# ── ingress ───────────────────────────────────────────────────────────────────────────────────

resource "google_compute_firewall" "allow_cloudflare" {
  name        = "${local.fw_prefix}-allow-cloudflare"
  project     = var.project_id
  network     = google_compute_network.vpc.name
  direction   = "INGRESS"
  description = "Cloudflare -> origin TLS. The origin lock is enforced downstream, in nginx."

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = var.cloudflare_ipv4_ranges
  target_tags   = var.edge_target_tags
}

resource "google_compute_firewall" "allow_cloudflare_v6" {
  name      = "${local.fw_prefix}-allow-cloudflare-v6"
  project   = var.project_id
  network   = google_compute_network.vpc.name
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = var.cloudflare_ipv6_ranges
  target_tags   = var.edge_target_tags
}

/**
 * Google's uptime probers reach the origin IP DIRECTLY, bypassing Cloudflare.
 *
 * The zone-wide WAF geo gate answers 451 to US-sourced requests and Google's probers are largely
 * US-based, so any check routed through Cloudflare would be permanently red and page constantly.
 * The probers hit a dedicated /__probe/health path that is exempt from the origin lock and
 * restricted, here AND in nginx, to the published prober addresses.
 */
resource "google_compute_firewall" "allow_uptime_probers" {
  name        = "${local.fw_prefix}-allow-uptime-probers"
  project     = var.project_id
  network     = google_compute_network.vpc.name
  direction   = "INGRESS"
  description = "Google uptime probers -> /__probe/health, bypassing the Cloudflare geo gate."

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = var.uptime_prober_cidrs
  target_tags   = var.edge_target_tags

  lifecycle {
    # An empty list produces a rule that admits NOTHING, locking every prober out while looking like
    # a successful apply. Checked here rather than as a variable validation so that
    # `terraform validate` still judges only syntax and schema, while any real plan fails loudly.
    precondition {
      condition     = length(var.uptime_prober_cidrs) > 0
      error_message = "uptime_prober_cidrs is empty. Run `node scripts/infra/generate-prober-cidrs.js` (needs an authenticated gcloud) and commit prober-cidrs.json. An empty allowlist would lock every uptime prober out of the origin."
    }
  }
}

/**
 * SSH from the IAP TCP forwarding range only — never 0.0.0.0/0.
 *
 * This rule is also the ONLY route Ansible has into these nodes (infra/ansible/inventory/gcp.yml
 * proxies through `gcloud compute start-iap-tunnel`). Removing it does not merely close SSH; it
 * makes node configuration unreachable. If a playbook cannot connect, the fix is a working tunnel,
 * never a wider source range.
 */
resource "google_compute_firewall" "allow_iap_ssh" {
  name        = "${local.fw_prefix}-allow-iap-ssh"
  project     = var.project_id
  network     = google_compute_network.vpc.name
  direction   = "INGRESS"
  description = "IAP TCP forwarding range only. Also the sole route in for Ansible."

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.iap_forwarding_cidrs
  target_tags   = var.edge_target_tags
}
