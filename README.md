# IBM Z OpenShift Job Monitor

Live dashboard for **IBM Z (s390x)** OpenShift CI periodic jobs — pass rates, upgrade health, and release readiness across OCP versions.

**Site URL:** **https://ibm-adarsh.github.io/ibmz-openshift-job-monitor/**

Data is loaded from **Sippy** and **Prow**. Job names are synced from **`openshift/release`** `ci-operator` configs (main branch).

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

- **Multiarch** nightlies (`openshift-multiarch-main__nightly-*.yaml`) targeting **s390x / multi-z / libvirt-s390x**. **Heterogeneous** = `-x-xz`, `-z-xz`, `-z-za` (Z + arm64), or legacy `-heterogeneous`.
- **Hypershift / MCE** IBM Z periodics (`openshift-hypershift-release-*__periodics-mce.yaml`, e.g. `e2e-ibmz-s390x-mgmt-ovn-conformance-virt-oz`).

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
- [Live site](https://ibm-adarsh.github.io/ibmz-openshift-job-monitor/) — GitHub Pages (after Pages is enabled)
