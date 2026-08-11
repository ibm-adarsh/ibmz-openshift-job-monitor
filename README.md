# IBM Z OpenShift Job Monitor

Live dashboard for **IBM Z (s390x)** OpenShift CI periodic jobs — pass rates, upgrade health, and release readiness across OCP versions.

Data is loaded from **Sippy** and **Prow**. Job names are synced from **`openshift/release`** `ci-operator` configs (main branch).

---

## Quick start (standalone repo + release clone)

### 1. Clone both repos (siblings on disk)

```bash
mkdir ~/ibmz-ci && cd ~/ibmz-ci

git clone https://github.com/ibm-adarsh/ibmz-openshift-job-monitor.git
git clone https://github.com/openshift/release.git
cd release && git checkout main && git pull
```

Expected layout:

```text
ibmz-ci/
  ibmz-openshift-job-monitor/   ← this repo
  release/                      ← openshift/release on main
```

The inventory script auto-detects `../release` when repos are siblings.

### 2. Setup (one command)

```bash
cd ibmz-openshift-job-monitor
npm run setup
```

Runs `npm install` and writes `src/data/job-inventory.json` from `release/ci-operator/config/openshift/multiarch/`.

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
cd ../release && git pull origin main
cd ../ibmz-openshift-job-monitor && npm run inventory
```

---

## What gets synced?

Jobs from `openshift-multiarch-main__nightly-*.yaml` targeting **s390x / multi-z / libvirt-s390x** (Power excluded). **Heterogeneous** = names ending in `-x-xz` or `-z-xz`.

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
# Serve dist/ with any static host; Prow proxy needed for full history in prod
```

---

## Repo layout

```text
ibmz-openshift-job-monitor/
  scripts/
    setup.sh
    regenerate-inventory.py
  src/
    data/job-inventory.json   # generated — commit after sync
    components/               # React + PatternFly UI
```

---

## Related

- [openshift/release](https://github.com/openshift/release) — CI job definitions
- [Sippy](https://sippy.dptools.openshift.org/) — OpenShift CI analytics
- [Prow](https://prow.ci.openshift.org/) — job run logs
