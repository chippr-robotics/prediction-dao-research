# The FairWins estate

Architecture diagrams for the whole running system: cloud infrastructure, request paths, identity
and secrets, the application, and the on-chain contract estate.

!!! info "Measured, not asserted — 2026-08-15"
    Every element below was read from the live estate or from the repository's own records on
    2026-08-15: `gcloud` for GCP resources, `deployments/*.json` for contract addresses,
    `terraform state` for what is under management. Where the running system disagrees with a
    written claim elsewhere in the repo, this page follows the running system and says so.

    **Regenerate the inventory** with the commands in [Keeping this current](#keeping-this-current)
    before trusting it after a large change.

---

## 1. Whole estate

Three planes that fail independently: the **edge and origin** serving members, the **chains**
holding value, and the **control plane** that deploys and administers everything.

```mermaid
graph TB
    subgraph members["Members"]
        browser["Browser / PWA"]
    end

    subgraph cf["Cloudflare — zone fairwins.app"]
        dns["DNS + TLS"]
        waf["WAF geo gate — HTTP 451<br/>a legal control, spec 007"]
        lock["Origin-lock transform rule<br/>injects a shared header"]
    end

    subgraph gcp["GCP project chippr-bots-site-wp — SHARED"]
        subgraph vpc["VPC fairwins-infra / us-central1-a"]
            bundler["GCE fairwins-bundler<br/>alto ERC-4337 bundler"]
            gateway["GCE fairwins-gateway<br/>relay gateway + OZ engine + redis"]
        end
        run["Cloud Run<br/>SPA prod / staging / staging-testnet"]
        sm["Secret Manager<br/>16 managed containers"]
        kms["Cloud KMS<br/>relay gas + paymaster signing keys"]
        ar["Artifact Registry<br/>cloud-run-source-deploy"]
        mon["Cloud Monitoring<br/>uptime checks, alert policies"]
        foreign["Unrelated workloads<br/>WordPress, clearpath-*, fukuii-*, kings-edge-*"]
    end

    subgraph chains["Chains"]
        evm["8 EVM networks<br/>32 contracts"]
        btc["Bitcoin — non-EVM, spec 061"]
    end

    subgraph ctrl["Control plane"]
        ws["Operator workstation<br/>this NAS"]
        gha["GitHub Actions<br/>via Workload Identity Federation"]
    end

    browser --> dns --> waf --> lock
    lock --> run
    lock --> bundler
    lock --> gateway
    browser -.->|"direct RPC, member's own endpoint"| evm
    browser -.->|"signs every transaction"| evm
    gateway --> kms
    gateway --> evm
    bundler --> evm
    ws --> sm
    ws --> evm
    gha --> ar
    gha --> run

    style foreign fill:#3a2020,stroke:#a05252,color:#e8d5d5
    style chains fill:#1f3320,stroke:#5a8f5f,color:#dfeadf
    style ctrl fill:#1f2a3a,stroke:#5580a5,color:#dae4ef
```

!!! danger "The project is shared, and that shapes every IAM decision"
    `chippr-bots-site-wp` hosts workloads this repository does not own. Every IAM grant in the
    Terraform is additive (`*_iam_member`); the `_binding` and `_policy` forms are authoritative and
    would strip access from principals nobody here has heard of. `npm run check:iac` rejects both,
    and the CI identity separately lacks `projectIamAdmin` so the same mistake also fails at the API.

    The Workload Identity **pool** is itself shared: `github-actions` carries a provider scoped to
    `chippr-robotics/kings_edge`. It is referenced as a Terraform `data` source, never a `resource`,
    so deleting a block here can never take out another team's CI.

---

## 2. Request paths

All containers on a VM share **one network namespace**, reproducing the Cloud Run sidecar model.
This is what makes every `localhost` coupling below correct verbatim.

```mermaid
graph LR
    subgraph edge["Cloudflare"]
        e1["fairwins.app"]
        e2["relay.fairwins.app"]
        e3["bundler.fairwins.app"]
    end

    subgraph gw["VM fairwins-gateway — one netns"]
        gnginx["host nginx :443"]
        gsvc["relay-gateway :8788"]
        engine["OZ relayer engine :8080"]
        redis["redis :6379"]
    end

    subgraph bd["VM fairwins-bundler — one netns"]
        bnginx["host nginx :443"]
        olock["origin-lock nginx :8080"]
        alto["alto :3000"]
    end

    spa["Cloud Run — SPA static bundle"]

    e1 --> spa
    e2 --> gnginx --> gsvc
    gsvc -->|"localhost:8080"| engine
    gsvc -->|"localhost:6379"| redis
    engine -->|"webhook to localhost:8788"| gsvc
    e3 --> bnginx --> olock -->|"127.0.0.1:3000"| alto

    style gw fill:#1f2a3a,stroke:#5580a5,color:#dae4ef
    style bd fill:#2a2333,stroke:#8060a0,color:#e4dcef
```

!!! warning "A plain HTTP 200 proves nothing here"
    The origin-lock nginx serves its **own** static `200` on its health path without ever touching
    alto — that is the check which stayed green throughout the 2026-07-12 stall while gasless
    transactions silently were not landing. The uptime check therefore matches the EntryPoint
    address in an `eth_supportedEntryPoints` response.

    `infra/vm/nginx/fairwins-bundler.conf` turns the prober's plain **GET** on `/__probe/health`
    into that JSON-RPC POST server-side, so the check itself is a GET. `request_method` is
    force-new on a `google_monitoring_uptime_check_config`, so declaring POST in Terraform would
    replace the live check and discard its history.

    The gateway has the same trap in a different shape: `/status` returns `"status":"ok"`
    unconditionally, even with every chain down. Match on the per-chain `rpc` state instead.

!!! note "Why the engine's webhook URL must stay `localhost`"
    A bridge network instead of a shared namespace would break it **silently**: the engine POSTs
    confirmations into the void, the gateway never learns a transaction landed, and intents report
    `submitted` forever with no chain fallback.

---

## 3. Identity and secrets

No long-lived credential exists anywhere in this design. Every actor obtains short-lived tokens.

```mermaid
graph TB
    subgraph humans["People"]
        op["Named operator"]
    end

    subgraph ci["GitHub Actions"]
        pr["Pull request workflow"]
        main["Merge to main"]
    end

    subgraph wif["Workload Identity Federation"]
        pool["Pool github-actions — SHARED<br/>data source, never a resource"]
        prov["Provider github-oidc<br/>scoped to prediction-dao-research"]
        kings["Provider github — kings_edge<br/>not ours, untouched"]
    end

    subgraph ids["Service accounts"]
        tfplan["fairwins-tf-plan<br/>read-only"]
        tfapply["fairwins-tf-apply<br/>no owner, editor, projectIamAdmin,<br/>cloudkms.admin or SA key admin"]
        ops["fairwins-ops<br/>workstation identity"]
        bsa["fairwins-bundler"]
        gsa["fairwins-relay-engine"]
    end

    subgraph vault["Secret Manager + KMS"]
        wsec["12 workstation secrets"]
        rsec["4 runtime secrets"]
        kk["KMS signing keys<br/>sign-only, never exportable"]
    end

    op -->|"impersonates — no key file"| ops
    op --> pool
    pr --> pool --> prov
    main --> prov
    prov --> tfplan
    prov --> tfapply
    pool --- kings
    ops -->|"secretAccessor, PER SECRET"| wsec
    bsa -->|"per secret"| rsec
    gsa -->|"per secret"| rsec
    gsa -->|"signerVerifier, PER KEY"| kk

    style kings fill:#3a2020,stroke:#a05252,color:#e8d5d5
    style vault fill:#1f3320,stroke:#5a8f5f,color:#dfeadf
```

**How a secret reaches the code that needs it**

```mermaid
graph LR
    reg["scripts/secrets/registry.js<br/>THE inventory"]
    prof["Profile<br/>deploy / verify / publish / seed / rpc"]
    wrap["npm run sec"]
    child["Child process env<br/>never argv, never disk"]

    vm["VM boot"]
    fetch["fetch-secrets.sh"]
    tmpfs["/run/fairwins — tmpfs 0700<br/>one env file PER CONTAINER"]

    reg --> prof --> wrap --> child
    vm --> fetch --> tmpfs

    style child fill:#1f3320,stroke:#5a8f5f,color:#dfeadf
    style tmpfs fill:#1f3320,stroke:#5a8f5f,color:#dfeadf
```

!!! danger "Rules that are enforced, not documented"
    - **No service-account key file exists.** A downloaded key outlives employment, survives a
      stolen disk, and is copied by every backup. Impersonation yields short-lived tokens and is
      revoked by deleting one list entry.
    - **`serviceAccountTokenCreator` is granted on the ACCOUNT, never the project.** The project
      form would let every operator impersonate every service account here — including the one
      holding `signerVerifier` on the hot gas keys.
    - **Terraform never declares a secret *version*** (guardrail G-04): a version resource writes
      the payload into state in plaintext. It owns containers and access bindings only.
    - **Per-container scoping on the VMs.** The internet-facing container never receives the other
      container's credential; `preflight.sh` asserts this at every start.
    - **`VITE_` variables are not secrets and cannot be made into them** — they compile into the
      client bundle and are public once shipped.

---

## 4. Application

The SPA is the only signer of member transactions. The gateway is a **policy and proxy** layer that
never takes custody.

```mermaid
graph TB
    subgraph spa["SPA — React + Vite, one origin per tenant"]
        home["Home / Portfolio / Activity"]
        fin["Finance<br/>Earn · Trade · Collect · Predict · Transfer"]
        tools["Tools<br/>Protect · Address Book · Recovery · Reporting · Apps"]
    end

    subgraph rails["Two gasless rails, each with a self-submit fallback"]
        intents["Relayed EIP-712 intents<br/>specs 035 + 036"]
        userops["Sponsored UserOps<br/>spec 050, EntryPoint v0.6"]
    end

    subgraph gwmod["relay-gateway modules"]
        gintent["intent"]
        gpay["paymaster — ERC-7677"]
        gperps["perps"]
        gpoly["polymarket"]
        gsea["opensea"]
        gbtc["bitcoin"]
        gfees["fees — reads FeeRouter"]
        gpolicy["policy — screening, quotas, killswitch"]
    end

    subgraph ext["External venues — read or link-out"]
        pm["Polymarket CLOB"]
        perps["Gains · GMX v2 · Hyperliquid"]
        os["OpenSea"]
    end

    chain["EVM contracts"]
    btc["Bitcoin"]

    fin --> intents --> gintent --> chain
    fin --> userops --> gpay --> chain
    fin --> gperps --> perps
    fin --> gpoly --> pm
    fin --> gsea --> os
    tools --> gbtc --> btc
    gintent --> gpolicy
    gpay --> gpolicy
    gfees --> chain

    style rails fill:#1f2a3a,stroke:#5580a5,color:#dae4ef
    style ext fill:#2a2333,stroke:#8060a0,color:#e4dcef
```

!!! note "Non-custodial by construction"
    The member's wallet signs every order and every transfer. The gateway holds venue API
    credentials and screening policy; it cannot move member funds. Perps is **read-only** market
    data — no in-app execution ships (spec 082 FR-018). Every gasless path keeps a self-submit
    fallback, so losing the relayer degrades cost, never access.

---

## 5. On-chain estate

32 distinct contracts across 8 networks. Deployment is deliberately uneven: membership and wagers
live on one reference chain per cohort, while custody and liquidity span the mainnets.

```mermaid
graph TB
    subgraph ref["Reference chains — one home per cohort"]
        poly["Polygon 137<br/>mainnet cohort"]
        amoy["Amoy 80002<br/>testnet cohort"]
        mordor["Mordor 63<br/>ETC testnet + mini-app registry"]
    end

    subgraph multi["Multi-chain surfaces"]
        m1["Ethereum 1 · Optimism 10 · Base 8453 · Arbitrum 42161"]
        etc["ETC 61"]
    end

    core["Wagers + membership<br/>wagerRegistry · wagerRegistryIntents<br/>membershipManager · membershipVoucher<br/>sanctionsGuard · keyRegistry"]
    accounts["Accounts<br/>accountFactory · entryPoint<br/>verifyingPaymaster"]
    custody["Protect<br/>safePolicyGuardV2 · safeProposalHub<br/>policyGuardSetup"]
    money["Money movement<br/>feeRouter · bridgeRouter · liquidityRouter"]
    apps["Catalog + identity<br/>miniAppRegistry · callsignRegistry<br/>tokenFactory"]

    poly --> core
    amoy --> core
    mordor --> core
    poly --> accounts
    amoy --> accounts
    m1 --> accounts
    etc --> accounts
    poly --> custody
    mordor --> custody
    m1 --> custody
    etc --> custody
    poly --> money
    m1 --> money
    mordor --> money
    poly --> apps
    mordor --> apps

    style ref fill:#1f3320,stroke:#5a8f5f,color:#dfeadf
```

| Surface | Networks |
|---|---|
| `accountFactory`, `entryPoint` | all 8 |
| `wagerRegistry`, `membershipManager`, `sanctionsGuard` | polygon, amoy, mordor |
| `wagerRegistryIntents`, `wagerPoolFactory`, `tokenFactory` | polygon, mordor |
| `safePolicyGuardV2`, `safeProposalHub`, `policyGuardSetup` | polygon, mordor, etc, optimism, base, arbitrum |
| `feeRouter` | polygon, mordor, mainnet, optimism, base, arbitrum |
| `bridgeRouter`, `liquidityRouter` | polygon, mainnet, optimism, base, arbitrum |
| `miniAppRegistry` | polygon, mordor |
| `callsignRegistry`, `safePolicyGuard` (v1) | polygon |
| `polymarketAdapter`, `umaAdapter`, `chainlink*Adapter`, `verifyingPaymaster` | polygon, amoy |
| `externalDAORegistry`, `semaphoreVerifier`, `zkWagerPool*` | mordor |

!!! warning "This table corrects two stale claims elsewhere in the repo"
    `CLAUDE.md` states that `bridgeRouter` and `liquidityRouter` are *"not deployed on any network
    yet (issue #966)"*, and the fee-router notes say the `FeeRouter` is *"not deployed anywhere
    yet"*. Both are contradicted by `deployments/*.json`: the routers are recorded on five
    mainnets and the FeeRouter on six networks. Trust `deployments/` — it is the source of truth
    for addresses — and treat the prose as out of date.

---

## 6. Who owns what

The single most common way infrastructure-as-code fails is two systems believing they own the same
attribute. The split is explicit.

```mermaid
graph LR
    subgraph tf["Terraform — declares SHAPE"]
        t1["VPC, subnet, static IPs, firewall"]
        t2["GCE instances + their IAM"]
        t3["Secret containers + access"]
        t4["Artifact Registry, KMS ring"]
        t5["Workstation identity"]
    end

    subgraph cb["Cloud Build — owns the ARTIFACT"]
        c1["Container image tag"]
        c2["Cloud Run revision identity"]
    end

    subgraph ans["Ansible — converges node INTERIORS"]
        a1["Packages, docker, nginx, systemd"]
        a2["Secret delivery units"]
    end

    subgraph un["Deliberately UNMANAGED for now"]
        u1["Cloud Run service shape — manage_spa = false"]
        u2["Uptime checks + alert policies — manage_monitoring = false"]
        u3["Cloudflare rulesets — manage_edge = false"]
    end

    style un fill:#3a3320,stroke:#a08a52,color:#efe6d5
```

!!! info "Adoption status — 2026-08-15"
    `infra/terraform/environments/prod` holds **57 resources** and plans clean
    (`terraform plan -detailed-exitcode` → `0`, *No changes*).

    Three surfaces are switched off on purpose, because adopting them would have changed live
    behaviour rather than merely describing it:

    - **`manage_spa`** — the declaration would clear the running service's env vars, drop
      `startup_cpu_boost`, move off GEN1 and raise max instances 20 → 100.
    - **`manage_monitoring`** — every declared alert threshold differs from the live one. CPU
      0.70 → 0.90 and memory 85 → 90 are *looser*, and the uptime comparison inverts to `> 1` on
      `check_passed`, which may never fire. Import blocks are staged and mapped by **condition
      metric type**, not display name.
    - **`manage_edge`** — both Cloudflare rulesets are authoritative for their phase, so a first
      apply deletes any rule added through the dashboard.

    A surface is adopted only when its plan is clean. If a plan is not clean, the **configuration**
    is wrong — fix the repository, never apply to force live infrastructure to match.

---

## Keeping this current

These diagrams are hand-maintained. Re-derive the facts before editing:

```bash
# Contract matrix (section 5)
node -e 'const fs=require("fs");const r={};for(const f of fs.readdirSync("deployments").filter(f=>/-chain\d+-v2\.json$/.test(f)&&!/hardhat|localhost/.test(f))){const n=/^(.+)-chain/.exec(f)[1];for(const[k,v]of Object.entries(JSON.parse(fs.readFileSync("deployments/"+f)).contracts||{}))if(/^0x[0-9a-fA-F]{40}$/.test(v)&&!/Impl$/.test(k))(r[k]??=new Set()).add(n)}for(const k of Object.keys(r).sort())console.log(k.padEnd(26),[...r[k]].sort().join(","))'

# Cloud footprint (sections 1 and 2)
gcloud run services list  --project=chippr-bots-site-wp
gcloud compute instances list --project=chippr-bots-site-wp --filter="labels.app=fairwins"
gcloud secrets list --project=chippr-bots-site-wp

# What is actually under management (section 6)
terraform -chdir=infra/terraform/environments/prod state list | wc -l
terraform -chdir=infra/terraform/environments/prod plan -detailed-exitcode   # 0 == no changes
```

**Related:** [Infrastructure as code](../developer-guide/infrastructure-as-code.md) ·
[Workstation secrets](../developer-guide/workstation-secrets.md) ·
[Gasless intents](../developer-guide/gasless-intents.md) ·
[`infra/vm/README.md`](https://github.com/chippr-robotics/prediction-dao-research/blob/main/infra/vm/README.md) ·
[`infra/observability/README.md`](https://github.com/chippr-robotics/prediction-dao-research/blob/main/infra/observability/README.md)
