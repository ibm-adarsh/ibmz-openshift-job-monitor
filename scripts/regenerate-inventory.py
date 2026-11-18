#!/usr/bin/env python3
"""
Scan openshift/release CI configs and write job-inventory.json.

Inclusion rule (future-proof):
  Any test job whose cluster_profile is listed in
  scripts/monitored-cluster-profiles.json is monitored, when its OCP
  version falls in the configured range. Scans the entire
  ci-operator/config tree every day — new orgs/repos/jobs appear
  automatically; removed jobs disappear on sync.

Default release root (first match):
  .vendor/openshift-release  (gitignored local clone)
  ../release                 (sibling clone)
  RELEASE_ROOT / --release-root
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
PROFILES_FILE = SCRIPT_DIR / "monitored-cluster-profiles.json"

# Entire ci-operator config tree — profile filter decides what to keep.
SCAN_GLOB = "ci-operator/config/**/*.yaml"

# Filename / path patterns that encode an OCP stream version.
_FILENAME_OCP_PATTERNS = (
    r"nightly-(\d+\.\d+)",
    r"ocp(\d)(\d{2})",  # ocp422 → 4.22
    r"__(\d+\.\d+)",
    r"release-(\d+\.\d+)",
    r"-(\d+\.\d+)(?:__|\.ya?ml$)",
)

# Job names like test-e2e-4-22-downstream or e2e-4.22-foo
_JOB_OCP_PATTERNS = (
    r"(?:^|[^0-9])([45])[.-](\d{1,2})(?:[^0-9]|$)",
    r"ocp([45])(\d{2})",
)


def load_profile_config() -> tuple[set[str], tuple[int, int], int]:
    raw = json.loads(PROFILES_FILE.read_text())
    profiles = {str(p).strip() for p in raw.get("profiles", []) if str(p).strip()}
    if not profiles:
        raise ValueError(f"No profiles configured in {PROFILES_FILE}")
    ocp = raw.get("ocpVersion") or {}
    min_ver = parse_ocp_version(str(ocp.get("min", "4.13")))
    if min_ver is None:
        raise ValueError("ocpVersion.min must look like '4.13'")
    max_major = int(ocp.get("maxMajor", 5))
    return profiles, min_ver, max_major


def parse_ocp_version(ver: str) -> tuple[int, int] | None:
    m = re.fullmatch(r"(\d+)\.(\d+)", ver)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def is_monitored_ocp_version(
    ver: str,
    min_ocp: tuple[int, int],
    max_major: int,
) -> bool:
    parsed = parse_ocp_version(ver)
    if parsed is None:
        return False
    major, minor = parsed
    if major > max_major:
        return False
    if major < min_ocp[0]:
        return False
    if major == min_ocp[0] and minor < min_ocp[1]:
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
        if (c / "ci-operator/config").is_dir():
            return c

    return (MONITOR_ROOT / ".vendor" / "openshift-release").resolve()


def _compact_ocp(major: str, minor: str) -> str:
    """ocp422 / groups ('4','22') → '4.22'."""
    return f"{int(major)}.{int(minor)}"


def versions_from_filename(name: str) -> list[str]:
    found: list[str] = []
    for pattern in _FILENAME_OCP_PATTERNS:
        for m in re.finditer(pattern, name, flags=re.IGNORECASE):
            if m.lastindex == 2 and pattern.startswith(r"ocp"):
                found.append(_compact_ocp(m.group(1), m.group(2)))
            else:
                found.append(m.group(1))
    return found


def versions_from_job_name(job: str) -> list[str]:
    found: list[str] = []
    for pattern in _JOB_OCP_PATTERNS:
        for m in re.finditer(pattern, job, flags=re.IGNORECASE):
            found.append(_compact_ocp(m.group(1), m.group(2)))
    return found


def versions_from_releases_block(text: str) -> list[str]:
    """OCP versions declared under the top-level `releases:` map."""
    m = re.search(r"(?ms)^releases:\n(.*?)(?=^[a-z_]+:|\Z)", text)
    if not m:
        return []
    return re.findall(r'(?m)^\s+version:\s*"(\d+\.\d+)"', m.group(1))


def versions_from_branch_env(text: str) -> list[str]:
    return re.findall(r'(?m)^\s+BRANCH:\s*"(\d+\.\d+)"', text)


def versions_from_ocp_base_images(text: str) -> list[str]:
    """base_images entries that pull from namespace ocp with name X.Y."""
    found: list[str] = []
    for block in re.split(r"(?m)^  [a-zA-Z0-9_-]+:\s*$", text):
        name_m = re.search(r'(?m)^\s+name:\s*"(\d+\.\d+)"', block)
        ns_m = re.search(r"(?m)^\s+namespace:\s*ocp\s*$", block)
        if name_m and ns_m:
            found.append(name_m.group(1))
    return found


def resolve_ocp_version(
    job: str,
    path: Path,
    text: str,
    min_ocp: tuple[int, int],
    max_major: int,
) -> str | None:
    """
    Best-effort OCP version for a job.

    Prefer job name, then filename stream, then releases:/BRANCH/base_images.
    Ignore non-OCP product versions (e.g. operator release-1.4).
    """
    ordered: list[str] = []
    ordered.extend(versions_from_job_name(job))
    ordered.extend(versions_from_filename(path.name))
    ordered.extend(versions_from_releases_block(text))
    ordered.extend(versions_from_branch_env(text))
    ordered.extend(versions_from_ocp_base_images(text))

    seen: set[str] = set()
    for ver in ordered:
        if ver in seen:
            continue
        seen.add(ver)
        if is_monitored_ocp_version(ver, min_ocp, max_major):
            return ver
    return None


def config_rel_path(release_root: Path, path: Path) -> str:
    try:
        rel = path.resolve().relative_to((release_root / "ci-operator/config").resolve())
        return str(rel)
    except ValueError:
        return path.name


def classify_job(job: str, profile: str, config_name: str) -> tuple[str, str, str | None]:
    # Hypershift / MCE IBM Z periodics always include "mgmt" in the job name.
    # Other work on -oz capacity (operators, add-ons) is tagged add-on — not hypershift.
    is_hypershift = "mgmt" in job
    is_addon = profile.endswith("-oz") and not is_hypershift

    jtype = "e2e"
    if "upgrade" in job or "upgrade" in config_name:
        jtype = "upgrade"
    elif is_hypershift:
        jtype = "hypershift"
    elif is_addon:
        jtype = "add-on"
    elif "serial" in job:
        jtype = "serial"
    elif "fips" in job:
        jtype = "fips"
    elif "image-ecosystem" in job:
        jtype = "image-ecosystem"
    elif "agent" in job or job.endswith("-sno"):
        jtype = "agent"
    elif "techpreview" in job:
        jtype = "techpreview"

    category = "vpn"
    if is_hypershift:
        category = "hypershift"
    elif is_addon:
        category = "add-on"
    elif (
        job.endswith("-x-xz")
        or job.endswith("-z-xz")
        or job.endswith("-z-zx")
        or job.endswith("-z-za")
        or job.endswith("-heterogeneous")
        or profile.endswith("-amd64")
        or profile.endswith("-arm64")
    ):
        category = "heterogeneous"
    elif "ipv6" in profile:
        category = "vpn"

    upgrade_from = None
    um = re.search(r"upgrade-from-(?:nightly|stable)-(\d+\.\d+)", config_name)
    if um:
        upgrade_from = um.group(1)
        category = "upgrade"
        jtype = "upgrade"
    return jtype, category, upgrade_from


def iter_config_files(release_root: Path) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for path in sorted(release_root.glob(SCAN_GLOB)):
        if not path.is_file():
            continue
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        files.append(path)
    return files


def iter_test_entries(text: str) -> list[tuple[str, str]]:
    """
    Yield (job_name, test_block) for each entry under top-level `tests:`.

    Handles both `- as: name` and `- always_run: ...\\n  as: name` shapes.
    """
    m = re.search(r"(?ms)^tests:\n(.*?)(?=^[a-z_]+:|\Z)", text)
    if not m:
        return []
    body = m.group(1)
    out: list[tuple[str, str]] = []
    for part in re.split(r"(?m)^- ", body)[1:]:
        am = re.search(r"(?m)^(?:\s*)as:\s*(\S+)", part)
        if not am:
            continue
        out.append((am.group(1).strip(), part))
    return out


def collect_jobs(
    release_root: Path,
    profiles: set[str],
    min_ocp: tuple[int, int],
    max_major: int,
) -> list[dict]:
    config_root = release_root / "ci-operator/config"
    if not config_root.is_dir():
        raise FileNotFoundError(f"ci-operator/config not found under {release_root}")

    # Fast reject: every monitored profile today shares this prefix.
    # Fall back to per-profile checks if the allowlist ever diverges.
    shared_prefix = os.path.commonprefix(sorted(profiles))
    needle = shared_prefix if len(shared_prefix) >= 8 else None

    jobs: list[dict] = []
    for path in iter_config_files(release_root):
        text = path.read_text(errors="ignore")
        if needle:
            if needle not in text:
                continue
        elif not any(p in text for p in profiles):
            continue

        for job, block in iter_test_entries(text):
            if not job:
                continue
            pm = re.search(r"(?m)^\s+cluster_profile:\s*(\S+)", block)
            if not pm:
                continue
            profile = pm.group(1)
            if profile not in profiles:
                continue
            ver = resolve_ocp_version(job, path, text, min_ocp, max_major)
            if ver is None:
                continue
            jtype, category, upgrade_from = classify_job(job, profile, path.name)
            jobs.append(
                {
                    "ocpVersion": ver,
                    "name": job,
                    "jobType": jtype,
                    "category": category,
                    "clusterProfile": profile,
                    "configFile": config_rel_path(release_root, path),
                    "upgradeFrom": upgrade_from,
                }
            )
    return dedupe(jobs)


def dedupe(jobs: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for j in jobs:
        key = (j["ocpVersion"], j["name"], j["configFile"])
        if key in seen:
            continue
        seen.add(key)
        out.append(j)
    return out


def print_summary(jobs: list[dict], release_root: Path, profiles: set[str]) -> None:
    versions = Counter(j["ocpVersion"] for j in jobs)
    types = Counter(j["jobType"] for j in jobs)
    cats = Counter(j["category"] for j in jobs)
    profs = Counter(j["clusterProfile"] for j in jobs)
    orgs = Counter(j["configFile"].split("/", 1)[0] for j in jobs)
    print(f"Release root: {release_root}")
    print(f"Monitored profiles ({len(profiles)}): {', '.join(sorted(profiles))}")
    print(f"Total jobs: {len(jobs)}")
    print(
        f"OCP versions ({len(versions)}): "
        f"{', '.join(sorted(versions.keys(), key=lambda v: [int(x) for x in v.split('.')]))}"
    )
    print("By job type:", ", ".join(f"{k}={v}" for k, v in sorted(types.items())))
    print("By inventory category:", ", ".join(f"{k}={v}" for k, v in sorted(cats.items())))
    print("By cluster profile:", ", ".join(f"{k}={v}" for k, v in sorted(profs.items())))
    print("By config org:", ", ".join(f"{k}={v}" for k, v in sorted(orgs.items())))
    missing = sorted(profiles - set(profs))
    if missing:
        print("Profiles with 0 jobs right now:", ", ".join(missing))
    print()
    print("Jobs to watch (name · OCP · type · profile):")
    print("-" * 72)
    for j in sorted(jobs, key=lambda x: (x["ocpVersion"], x["name"], x["configFile"])):
        hetero = " hetero" if j["category"] == "heterogeneous" else ""
        up = f" from {j['upgradeFrom']}" if j.get("upgradeFrom") else ""
        print(
            f"  {j['name']} · OCP {j['ocpVersion']} · {j['jobType']}{hetero}{up} · {j['clusterProfile']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync IBM Z job inventory from openshift/release by cluster_profile."
    )
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

    try:
        profiles, min_ocp, max_major = load_profile_config()
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"Error loading {PROFILES_FILE}: {e}", file=sys.stderr)
        sys.exit(1)

    release_root = resolve_release_root(args.release_root)

    try:
        jobs = collect_jobs(release_root, profiles, min_ocp, max_major)
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
            "  (cd .vendor/openshift-release && git sparse-checkout set "
            "ci-operator/config)",
            file=sys.stderr,
        )
        print("  npm run inventory", file=sys.stderr)
        sys.exit(1)

    if not jobs:
        print(
            "Error: no jobs found for monitored cluster profiles — check release checkout.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.list:
        print_summary(jobs, release_root, profiles)
        return

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(jobs, indent=2) + "\n")
    print(f"Wrote {len(jobs)} jobs → {out_path}")
    print_summary(jobs, release_root, profiles)


if __name__ == "__main__":
    main()
