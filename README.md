# IBM Z OpenShift Job Monitor

Live dashboard for **IBM Z (s390x)** OpenShift CI periodic jobs — pass rates, upgrade health, and release readiness across OCP versions.

**Site URL:** **https://ibm-adarsh.github.io/ibmz-openshift-job-monitor/**

Data is loaded from **Sippy** and **Prow**. Job names are synced from **`openshift/release`** `ci-operator` configs (main branch).

---

## Architecture and flow

This section explains how the dashboard is built, where live data comes from, and how a user moves through the UI. No backend server is required in production — GitHub Pages serves a static React app, and the browser talks to Sippy directly.

### Big picture

```mermaid
flowchart LR
  subgraph Build["Build time (CI or local)"]
    REL["openshift/release<br/>ci-operator configs"]
    PY["Python inventory script<br/>scripts/regenerate-inventory.py"]
    INV["job-inventory.json<br/>baked into the app"]
    REL --> PY --> INV
  end

  subgraph Runtime["Runtime (browser)"]
    UI["React + PatternFly UI<br/>Jobs · Summary · filters"]
    SIPPY["Sippy API<br/>pass rates · run history"]
    PROW["Prow<br/>job logs / history"]
    ANA["CI Analyzer<br/>failed tests · phases · artifacts"]
    UI --> SIPPY
    UI -.->|"dev proxy only"| PROW
    UI -->|"streak bar click"| ANA
    UI -->|"drawer run links"| PROW
  end

  INV --> UI
```

**In one sentence:** the job *list* is fixed at build time from `openshift/release`; live *status and history* are fetched in the browser from Sippy; Prow and the CI Analyzer are used as deep links for logs and failure analysis.

### Technology stack

| Layer | Choice | Role |
|-------|--------|------|
| UI | **TypeScript**, **React 19**, **PatternFly 6** | Dashboard pages, filters, tables, drawer |
| App shell | **Vite 8** | Dev server, production static build |
| Inventory | **Python 3** (`regenerate-inventory.py`) | Scan release configs → `job-inventory.json` |
| Lint / types | **oxlint**, **TypeScript** | Static checks before build |
| Hosting | **GitHub Pages** + Actions | Static site; rebuild inventory on each deploy |
| Live CI stats | **Sippy** (`sippy.dptools.openshift.org`) | Pass rates, run lists, last pass, flakes |
| Job logs | **Prow** (`prow.ci.openshift.org`) | Build view / history (drawer links) |
| Failure analysis | **CI Analyzer** (`ibm-adarsh.github.io/ci-analyzer`) | Failed tests, PRE/TEST/POST phases, leases, artifacts |
| Job definitions | **openshift/release** | Source of truth for which periodics exist |

### Where each external system is used

| System | Used for | Not used for |
|--------|----------|--------------|
| **openshift/release** | Which IBM Z jobs to monitor (names, OCP version, category) | Live pass/fail results |
| **Sippy** | Latest outcome, 7-run / 7-day / 30-day pass %, run sparkline data | Serving the website itself |
| **Prow** | Opening a specific run’s deck/logs from the job drawer | Primary data source on GitHub Pages |
| **CI Analyzer** | Opening a streak bar into failed tests, phases, timing, artifact dirs | Replacing Sippy pass-rate math |

### Build-time flow (job inventory)

1. Clone or refresh `openshift/release` (multiarch + hypershift configs).
2. Run `npm run inventory` (Python) to keep only monitored IBM Z jobs (OCP 4.13–5.x).
3. Write `src/data/job-inventory.json`.
4. Vite builds the React app with that JSON embedded.
5. On `main`, GitHub Actions does steps 1–4 and publishes `dist/` to Pages.

```mermaid
sequenceDiagram
  participant Dev as Developer / Actions
  participant Rel as openshift/release
  participant Py as regenerate-inventory.py
  participant Json as job-inventory.json
  participant Vite as Vite build
  participant Pages as GitHub Pages

  Dev->>Rel: checkout main configs
  Dev->>Py: npm run inventory
  Py->>Json: write monitored jobs
  Dev->>Vite: npm run build
  Vite->>Json: import inventory
  Vite->>Pages: upload static assets
```

### Runtime flow (live dashboard)

1. User opens the static site.
2. App loads the baked-in inventory (all monitored jobs / versions) — **Sippy does not decide which jobs exist**.
3. Browser calls **Sippy** in two phases (stats, then run history) with limited parallelism.
4. UI hydrates rows: status, streak, last green, pass meters, run bars.
5. In **local dev**, Vite can also proxy Prow HTML history; on Pages, Sippy is enough for the table.

```mermaid
flowchart TD
  A[Open dashboard] --> B[Load job-inventory.json]
  B --> C[Phase 1: Sippy /api/jobs per OCP version]
  C --> D[Phase 2: Sippy /api/jobs/runs per inventory job]
  D --> E[Hydrate table: status · streak · pass % · 7-run bars]
  E --> F{User action}
  F -->|Filters / Summary tab| G[Slice jobs by version · category · tag]
  F -->|Click job name| H[Drawer: history + Prow links]
  F -->|Click streak bar| I[CI Analyzer execution URL]
  F -->|CSV / copy| J[Export or clipboard helpers]
```

### How Sippy is called (simple walkthrough)

Think of it like a checklist, not “Sippy discovers the world”:

1. **Start from our list** — `job-inventory.json` already says which periodics to watch (from `openshift/release` + cluster profiles).
2. **Phase 1 — job stats** — for each distinct OCP version in that list, call `/api/jobs?release=…` once. That returns Sippy’s summary numbers (last pass, recent pass %, …) for many jobs; we keep the rows that match our inventory names.
3. **Phase 2 — run history** — for **each** inventory job, call `/api/jobs/runs` once to get recent executions for streaks and pass-rate windows.
4. **Update the UI** — merge stats + runs into the dashboard tables.

```mermaid
flowchart TD
  S1["1. Select OCP versions from inventory<br/>e.g. 4.22, 4.23, 5.0"] --> S2["2. Call Jobs API per version<br/>/api/jobs?release=4.22"]
  S2 --> S3["3. Match inventory job names<br/>periodic-ci-…"]
  S3 --> S4["4. Call Runs API per job<br/>/api/jobs/runs?release=…&filter=…"]
  S4 --> S5["5. Update IBM Z Monitor Dashboard"]
  style S5 fill:#e8f5e9
```

#### Example call volume (current inventory ≈ 114 jobs, 13 OCP versions)

| Phase | What | Calls |
|-------|------|------:|
| Sippy job stats | `/api/jobs` **once per OCP version** | **13** |
| Run history | `/api/jobs/runs` **once per inventory job** | **114** |
| **Total** (GitHub Pages / Sippy path) | | **~127** |

If you monitored 3 versions with 100 inventory jobs total: **3 + 100 = 103** calls.  
If you had 100 jobs **on each of** 3 versions (300 rows): **3 + 300 = 303** calls.

`perPage` on the runs API only changes **how many runs** come back in each response (payload size), **not** how many HTTP calls you make.

#### Limited parallelism (not all at once)

Calls run in **two phases**, with small worker pools (`mapPool` in `hydrateLive.ts`):

| Phase | Endpoint | Parallelism |
|-------|----------|-------------|
| **1** | `/api/jobs` by OCP version | Up to **4** versions at a time |
| **2** | `/api/jobs/runs` by job | Starts **after** phase 1; up to **6** jobs at a time |

Phase 2 is a **flat** pool across **all** inventory jobs — not “finish version 4.22’s jobs, then 4.23’s.”  
So: version stats (max 4) → then run history (max 6).

Local **dev** may also try **Prow** history first per job, then fall back to Sippy — that can roughly double history attempts in the worst case.

#### Try the same APIs in a browser

**Sippy job stats** (1 call per OCP version — example 4.22):

https://sippy.dptools.openshift.org/api/jobs?release=4.22

**Sippy run history** (1 call per job — example kueue, lighter `perPage=45`):

https://sippy.dptools.openshift.org/api/jobs/runs?release=4.22&filter=%7B%22items%22%3A%5B%7B%22columnField%22%3A%22job%22%2C%22operatorValue%22%3A%22equals%22%2C%22value%22%3A%22periodic-ci-openshift-kueue-operator-main-libvirt-s390x-test-e2e-4-22-downstream%22%7D%5D%7D&perPage=45&sortField=timestamp&sort=desc

**Same job, deeper history (`perPage=90`):**

https://sippy.dptools.openshift.org/api/jobs/runs?release=4.22&filter=%7B%22items%22%3A%5B%7B%22columnField%22%3A%22job%22%2C%22operatorValue%22%3A%22equals%22%2C%22value%22%3A%22periodic-ci-openshift-kueue-operator-main-libvirt-s390x-test-e2e-4-22-downstream%22%7D%5D%7D&perPage=90&sortField=timestamp&sort=desc

Swap `release=4.22` for other versions (`4.23`, `5.0`, …) and change the `value` inside `filter` to any `periodic-ci-…` job name from the inventory.

### User journey in the UI

1. **Jobs tab** — swimlanes per OCP version; filter by homogeneous / heterogeneous / upgrade / hypershift and by test type (e2e, serial, FIPS, …).
2. **Pass rates** — last **7 runs**, **7 days**, and **30 days** (green ≥60%, amber 40–59%, red &lt;40%).
3. **Click job name** — drawer with previous runs and direct **Prow** links (kept as the classic CI view).
4. **Click a streak bar** — opens that run in the **CI Analyzer** for failed tests, phase timing, leases, comparison context, and artifact links.
5. **Summary tab** — fleet overview, heatmap, upgrade path, CSV download.

### Key source files

| Path | Purpose |
|------|---------|
| `scripts/regenerate-inventory.py` | Build-time job discovery from release configs |
| `src/data/job-inventory.json` | Generated monitored job list |
| `src/data/hydrateLive.ts` | Merge Sippy/Prow data into UI job models |
| `src/api/sippyClient.ts` | Sippy HTTP client |
| `src/api/prowClient.ts` | Prow history helper (mainly local/dev) |
| `src/utils/links.ts` | Prow, Sippy, config, and CI Analyzer URLs |
| `src/components/*` | PatternFly UI (table, drawer, summary, filters) |
| `.github/workflows/deploy-pages.yml` | Inventory sync + Pages deploy |

---

## Quick start (standalone repo + release clone)

### 1. Clone this repo, then pull `openshift/release` locally (gitignored)

Preferred: sparse clone under `.vendor/` (not tracked / not committed):

```bash
git clone https://github.com/ibm-adarsh/ibmz-openshift-job-monitor.git
cd ibmz-openshift-job-monitor

mkdir -p .vendor
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/openshift/release.git .vendor/openshift-release
cd .vendor/openshift-release
git sparse-checkout set \
  ci-operator/config/openshift/multiarch \
  ci-operator/config/openshift/hypershift
cd ../..
```

Alternatively, keep a full sibling clone at `../release`. The inventory script auto-detects `.vendor/openshift-release`, then `../release`.

### 2. Setup (one command)

```bash
cd ibmz-openshift-job-monitor
npm run setup
```

Runs `npm install` and writes `src/data/job-inventory.json` from the release multiarch configs (OCP **4.13–5.x** IBM Z jobs only).

### 3. Run

```bash
npm run dev
```

Open **http://localhost:5173/**

---

## Job inventory

| Command | Description |
|---------|-------------|
| `npm run setup` | `npm install` + sync inventory |
| `npm run inventory` | Regenerate `src/data/job-inventory.json` only |
| `npm run list-jobs` | Print all jobs in the terminal (no file write) |

### Custom release path

```bash
export RELEASE_ROOT=/path/to/release
npm run inventory
```

Or:

```bash
python3 scripts/regenerate-inventory.py --release-root /path/to/release --list
```

After upstream CI config changes on **main**:

```bash
# vendor clone
cd .vendor/openshift-release && git pull origin main && cd ../..
# or sibling: cd ../release && git pull origin main
npm run inventory
```

---

## What gets synced?

Jobs for **OCP 4.13 through 5.x** (Power excluded):

- **Multiarch** nightlies (`openshift-multiarch-main__nightly-*.yaml`) targeting **s390x / multi-z / libvirt-s390x**. **Heterogeneous** = `-x-xz`, `-z-zx` (Z CP + x86 workers), `-z-za` (Z + arm64), or legacy `-z-xz` / `-heterogeneous`.
- **Hypershift / MCE** — OCP 5.0/5.1 `e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z` (formerly `virt-oz`; other hypershift Z jobs are omitted for now). IBM Cloud jobs `ocp-e2e-ibmcloud-ovn-multi-x-xz` and `ocp-e2e-ibmcloud-ovn-multi-s390x` are excluded on all versions.

---

## Dashboard

### Summary

- Fleet overview, 30-day pass matrix (click cell → filter Jobs), upgrade path health, CSV export

### Jobs

- Per-OCP swimlanes, filters, watchlist, 7d/30d pass rates, run sparklines

### Data

- **Last finished** outcome for pass/fail counts (not in-flight runs)
- Pass % = run-weighted (aborted excluded)
- Dev proxies Prow via Vite (`vite.config.ts`); Sippy is called directly

---

## Production build

```bash
npm run build
# Static files in dist/
```

---

## Host on GitHub Pages (public URL, live Sippy data)

The dashboard can run as a **static site** on GitHub Pages. Anyone with the URL can use it — no server required.

### How live data works

| Source | On GitHub Pages |
|--------|-----------------|
| **Sippy** (pass rates, run history, job stats) | Works — browser calls `sippy.dptools.openshift.org` directly (CORS enabled) |
| **Prow** HTML history | Not used in production builds (only local dev via Vite proxy) |
| **Job inventory** | Baked into the site at build time; CI refreshes it from `openshift/release` main on each deploy |

### One-time setup

1. Open **https://github.com/ibm-adarsh/ibmz-openshift-job-monitor/settings/pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from branch”).

### Deploy

Every push to `main` runs `.github/workflows/deploy-pages.yml`:

- Clones `openshift/release` (main)
- Regenerates `job-inventory.json`
- Builds with base path `/ibmz-openshift-job-monitor/`
- Publishes to GitHub Pages

**Site URL:** **https://ibm-adarsh.github.io/ibmz-openshift-job-monitor/**

Manual redeploy: **Actions** → **Deploy GitHub Pages** → **Run workflow**.

### Local build matching Pages

```bash
VITE_BASE_PATH=/ibmz-openshift-job-monitor/ npm run build
npx vite preview --base /ibmz-openshift-job-monitor/
```

---

## Repo layout

```text
ibmz-openshift-job-monitor/
  scripts/
    setup.sh
    regenerate-inventory.py
  .github/workflows/deploy-pages.yml
  src/
    data/job-inventory.json   # generated — commit after sync
    components/               # React + PatternFly UI
```

---

## Related

- [openshift/release](https://github.com/openshift/release) — CI job definitions
- [Sippy](https://sippy.dptools.openshift.org/) — OpenShift CI analytics
- [Prow](https://prow.ci.openshift.org/) — job run logs
- [CI Analyzer](https://ibm-adarsh.github.io/ci-analyzer/) — failed tests, phases, leases, artifacts
- [Live site](https://ibm-adarsh.github.io/ibmz-openshift-job-monitor/) — GitHub Pages (after Pages is enabled)
