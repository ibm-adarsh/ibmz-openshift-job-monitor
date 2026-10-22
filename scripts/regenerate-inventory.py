#!/usr/bin/env python3
"""
Scan openshift/release multiarch nightly CI configs and write job-inventory.json.

Monitors IBM Z (s390x) jobs for OCP 4.13 through 5.x only.

Default release root (first match):
  .vendor/openshift-release  (gitignored local clone)
  ../release                 (sibling clone)
  RELEASE_ROOT / --release-root

Override:
  RELEASE_ROOT=/path/to/release python3 scripts/regenerate-inventory.py
  python3 scripts/regenerate-inventory.py --list          # print jobs, no write
  python3 scripts/regenerate-inventory.py --release-root ../..
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MONITOR_ROOT = SCRIPT_DIR.parent
OUT = MONITOR_ROOT / "src/data/job-inventory.json"

# Inclusive lower bound; exclusive upper major (4.13 … 5.x).
MIN_OCP = (4, 13)
MAX_OCP_MAJOR = 5


def parse_ocp_version(ver: str) -> tuple[int, int] | None:
    m = re.fullmatch(r"(\d+)\.(\d+)", ver)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def is_monitored_ocp_version(ver: str) -> bool:
    parsed = parse_ocp_version(ver)
    if parsed is None:
        return False
    major, minor = parsed
    if major > MAX_OCP_MAJOR:
        return False
    if major < MIN_OCP[0]:
        return False
    if major == MIN_OCP[0] and minor < MIN_OCP[1]:
        return False
    return True


def resolve_release_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("RELEASE_ROOT")
    if env:
        return Path(env).resolve()

    candidates: list[Path] = [
        MONITOR_ROOT / ".vendor" / "openshift-release",
        MONITOR_ROOT.parent / "release",
        MONITOR_ROOT.parents[1],
    ]
    for candidate in candidates:
        c = candidate.resolve()
        multiarch = c / "ci-operator/config/openshift/multiarch"
        if multiarch.is_dir():
            return c

    return (MONITOR_ROOT / ".vendor" / "openshift-release").resolve()


def collect_jobs(multiarch: Path) -> list[dict]:
    jobs: list[dict] = []
    if not multiarch.is_dir():
        raise FileNotFoundError(f"Multiarch config dir not found: {multiarch}")

    for f in sorted(multiarch.glob("openshift-multiarch-main__nightly-*.yaml")):
        m = re.search(r"nightly-(\d+\.\d+)", f.name)
        if not m:
            continue
        ver = m.group(1)
        if not is_monitored_ocp_version(ver):
            continue
        text = f.read_text()
        for block in re.split(r"\n- as: ", text)[1:]:
            job = block.split("\n", 1)[0].strip()
            if not any(x in block for x in ("s390x", "multi-z", "libvirt-s390x")) and not any(
                x in job for x in ("s390x", "multi-z")
            ):
                continue
            if "ppc64le" in job or "powervs" in job or "multi-p" in job:
                continue
            pm = re.search(r"cluster_profile:\s*(\S+)", block)
            profile = pm.group(1) if pm else "unknown"
            if "ppc" in profile:
                continue
            jtype = "e2e"
            if "upgrade" in job or "upgrade" in f.name:
                jtype = "upgrade"
            elif "serial" in job:
                jtype = "serial"
            elif "fips" in job:
                jtype = "fips"
            elif "image-ecosystem" in job:
                jtype = "image-ecosystem"
            elif "agent" in job:
                jtype = "agent"
            elif "techpreview" in job:
                jtype = "techpreview"
            category = "old-profile"
            if job.endswith("-x-xz") or job.endswith("-z-xz") or job.endswith("-z-za"):
                category = "heterogeneous"
            elif "ibmcloud" in profile:
                category = "ibmcloud"
            elif "vpn" in profile:
                category = "vpn"
            elif "multi-z" in job or "amd64" in profile:
                category = "old-profile"
            upgrade_from = None
            um = re.search(r"upgrade-from-(?:nightly|stable)-(\d+\.\d+)", f.name)
            if um:
                upgrade_from = um.group(1)
                category = "upgrade"
                jtype = "upgrade"
            jobs.append(
                {
                    "ocpVersion": ver,
                    "name": job,
                    "jobType": jtype,
                    "category": category,
                    "clusterProfile": profile,
                    "configFile": f.name,
                    "upgradeFrom": upgrade_from,
                }
            )

    seen: set[tuple] = set()
    out: list[dict] = []
    for j in jobs:
        key = (j["ocpVersion"], j["name"], j["configFile"])
        if key in seen:
            continue
        seen.add(key)
        out.append(j)
    return out


def print_summary(jobs: list[dict], release_root: Path) -> None:
    versions = Counter(j["ocpVersion"] for j in jobs)
    types = Counter(j["jobType"] for j in jobs)
    cats = Counter(j["category"] for j in jobs)
    print(f"Release root: {release_root}")
    print(f"Total IBM Z jobs: {len(jobs)}")
    print(f"OCP versions ({len(versions)}): {', '.join(sorted(versions.keys(), key=lambda v: [int(x) for x in v.split('.')]))}")
    print("By job type:", ", ".join(f"{k}={v}" for k, v in sorted(types.items())))
    print("By inventory category:", ", ".join(f"{k}={v}" for k, v in sorted(cats.items())))
    print()
    print("Jobs to watch (name · OCP · type · profile):")
    print("-" * 72)
    for j in sorted(jobs, key=lambda x: (x["ocpVersion"], x["name"])):
        hetero = " hetero" if j["category"] == "heterogeneous" else ""
        up = f" from {j['upgradeFrom']}" if j.get("upgradeFrom") else ""
        print(
            f"  {j['name']} · OCP {j['ocpVersion']} · {j['jobType']}{hetero}{up} · {j['clusterProfile']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync IBM Z job inventory from openshift/release configs.")
    parser.add_argument(
        "--release-root",
        type=str,
        default=None,
        help="Path to openshift/release clone (default: auto-detect or RELEASE_ROOT env)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print all jobs and summary; do not write job-inventory.json",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=str(OUT),
        help="Output JSON path (default: src/data/job-inventory.json)",
    )
    args = parser.parse_args()

    release_root = resolve_release_root(args.release_root)
    multiarch = release_root / "ci-operator/config/openshift/multiarch"

    try:
        jobs = collect_jobs(multiarch)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        print(
            "Clone openshift/release (main) into .vendor/ or set RELEASE_ROOT:",
            file=sys.stderr,
        )
        print(
            "  git clone --depth 1 --filter=blob:none --sparse "
            "https://github.com/openshift/release.git .vendor/openshift-release",
            file=sys.stderr,
        )
        print(
            "  (cd .vendor/openshift-release && "
            "git sparse-checkout set ci-operator/config/openshift/multiarch)",
            file=sys.stderr,
        )
        print("  npm run inventory", file=sys.stderr)
        sys.exit(1)

    if args.list:
        print_summary(jobs, release_root)
        return

    out_path = Path(args.out)
    out_path.write_text(json.dumps(jobs, indent=2) + "\n")
    print(f"Wrote {len(jobs)} jobs → {out_path}")
    print_summary(jobs, release_root)


if __name__ == "__main__":
    main()
