#!/usr/bin/env node
/**
 * Render a REDACTED, human-readable plan summary for a pull request (spec 087, FR-027 / SC-008).
 *
 * WHY NOT JUST POST THE PLAIN-TEXT PLAN
 * A saved plan file embeds the prior state of everything it touches, and `terraform show` renders
 * attribute values. Posting either into a PR comment publishes state to anyone who can read the
 * repository. This reads the JSON form, keeps the SHAPE of the change (which resources, which
 * actions, which attributes), and drops the VALUES that Terraform marked sensitive — guardrail G-15.
 *
 * WHAT A REVIEWER NEEDS TO SEE, AND WHY EACH IS CALLED OUT SEPARATELY
 *   - REPLACEMENTS, distinct from in-place updates (FR-027). A replace on a static IP or a KMS key
 *     is an outage or an unrecoverable loss; a replace reads almost identically to an update in
 *     Terraform's default output, which is exactly the confusion this separates.
 *   - DESTROYS, loudly, for the same reason.
 *   - IMPORTS, so an adoption is visibly an adoption.
 *   - IAM changes, because in a shared GCP project an IAM diff is the highest-consequence line in
 *     any plan.
 *
 * Usage: node scripts/infra/render-plan-summary.js <plan.json>
 */
const fs = require("fs");

const ACTION_LABEL = {
  create: "create",
  update: "update in place",
  delete: "DESTROY",
  "create,delete": "REPLACE (create then destroy)",
  "delete,create": "REPLACE (destroy then create)",
  read: "read",
  "no-op": "no change",
};

/** Resource types whose loss is unrecoverable or breaks public DNS. */
const IRREPLACEABLE = /^(google_kms_|google_secret_manager_secret$|google_compute_address$|google_storage_bucket$|google_artifact_registry_repository$)/;

function classify(change) {
  const actions = change.change.actions.join(",");
  return {
    address: change.address,
    type: change.type,
    actions,
    label: ACTION_LABEL[actions] || actions,
    importing: Boolean(change.change.importing),
    destructive: actions.includes("delete"),
    irreplaceable: IRREPLACEABLE.test(change.type),
    iam: /_iam_(member|binding|policy)$/.test(change.type),
  };
}

function main(argv) {
  const file = argv[0];
  if (!file) {
    console.error("usage: render-plan-summary.js <plan.json>");
    return 2;
  }

  const plan = JSON.parse(fs.readFileSync(file, "utf8"));
  const changes = (plan.resource_changes || [])
    .map(classify)
    .filter((c) => c.actions !== "no-op" && c.actions !== "read");

  const out = [];
  out.push("### Terraform plan");
  out.push("");

  if (changes.length === 0) {
    out.push("**No changes.** The configuration matches the live estate.");
    out.push("");
    out.push("_This is the pass condition for an adoption surface (FR-005)._");
    console.log(out.join("\n"));
    return 0;
  }

  const imports = changes.filter((c) => c.importing);
  const destroys = changes.filter((c) => c.destructive);
  const replacements = destroys.filter((c) => c.actions.includes("create"));
  const pureDestroys = destroys.filter((c) => !c.actions.includes("create"));
  const iam = changes.filter((c) => c.iam);
  const dangerous = destroys.filter((c) => c.irreplaceable);

  out.push(
    `**${changes.length}** resource change(s): ` +
      `${changes.filter((c) => c.actions === "create").length} to create, ` +
      `${changes.filter((c) => c.actions === "update").length} to update, ` +
      `${replacements.length} to replace, ${pureDestroys.length} to destroy.`
  );
  out.push("");

  if (dangerous.length) {
    out.push("> [!CAUTION]");
    out.push("> **This plan would destroy or replace an unrecoverable resource.**");
    for (const c of dangerous) out.push(`> - \`${c.address}\` (${c.label})`);
    out.push(">");
    out.push("> These carry `prevent_destroy`, so the plan should have errored. If it did not, the");
    out.push("> protection was removed along with the resource block — review before merging.");
    out.push("");
  }

  if (replacements.length) {
    out.push("#### Replacements (destroy and recreate — not an in-place update)");
    for (const c of replacements) out.push(`- \`${c.address}\` — ${c.label}`);
    out.push("");
  }

  if (pureDestroys.length) {
    out.push("#### Destroys");
    for (const c of pureDestroys) out.push(`- \`${c.address}\``);
    out.push("");
  }

  if (iam.length) {
    out.push("#### IAM changes");
    out.push("");
    out.push("_The GCP project is shared. Confirm every entry is an additive `*_iam_member`._");
    for (const c of iam) out.push(`- \`${c.address}\` — ${c.label}`);
    out.push("");
  }

  if (imports.length) {
    out.push("#### Adoptions (import)");
    for (const c of imports) out.push(`- \`${c.address}\``);
    out.push("");
  }

  const routine = changes.filter((c) => !c.destructive && !c.iam && !c.importing);
  if (routine.length) {
    out.push("<details><summary>Other changes</summary>");
    out.push("");
    for (const c of routine) out.push(`- \`${c.address}\` — ${c.label}`);
    out.push("");
    out.push("</details>");
    out.push("");
  }

  out.push("---");
  out.push("_Values are omitted by design: a plan embeds prior state, and this summary is public to");
  out.push("anyone who can read the repository. Inspect the full plan in the workflow artifact._");

  console.log(out.join("\n"));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { classify };
