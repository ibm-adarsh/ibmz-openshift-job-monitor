import inventory from "./job-inventory.json";
import type { JobCategory, JobType, VersionHealth, VersionSummary, ZJob } from "../types";
import { buildJobLinks, configGithubUrl } from "../utils/links";
import { severityRank } from "../utils/format";
import { weightedPassRate, terminalOutcome, isInFlightOutcome, isStreakFlaking } from "../utils/stats";

interface InventoryRow {
  ocpVersion: string;
  name: string;
  jobType: string;
  category: string;
  clusterProfile: string;
  configFile: string;
  upgradeFrom: string | null;
}

export function parseVersion(v: string): { major: number; minor: number } {
  const [major, minor] = v.split(".").map(Number);
  return {
    major: Number.isFinite(major) ? major : Number.NaN,
    minor: Number.isFinite(minor) ? minor : Number.NaN,
  };
}

/** Keep in sync with scripts/regenerate-inventory.py (OCP 4.13–5.x). */
export function isMonitoredOcpVersion(ver: string): boolean {
  const { major, minor } = parseVersion(ver);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major > 5) return false;
  if (major < 4) return false;
  if (major === 4 && minor < 13) return false;
  return major === 4 || major === 5;
}

/** Heterogeneous Z jobs: x86↔Z (x-xz), Z↔x86 (z-xz), Z↔arm64 (z-za), plus legacy *-heterogeneous. */
export function isHeterogeneousJobName(name: string): boolean {
  return (
    name.endsWith("-x-xz") ||
    name.endsWith("-z-xz") ||
    name.endsWith("-z-za") ||
    name.endsWith("-heterogeneous")
  );
}

export function heterogeneousTopology(
  name: string,
): "x-xz" | "z-xz" | "z-za" | "heterogeneous" | null {
  if (name.endsWith("-x-xz")) return "x-xz";
  if (name.endsWith("-z-xz")) return "z-xz";
  if (name.endsWith("-z-za")) return "z-za";
  if (name.endsWith("-heterogeneous")) return "heterogeneous";
  return null;
}

/** Collapse inventory tags into product families using job name as source of truth. */
function toCategory(
  row: InventoryRow,
): Exclude<JobCategory, "all"> {
  if (row.category === "upgrade" || row.upgradeFrom) return "upgrade";
  if (row.category === "hypershift" || row.jobType === "hypershift") return "hypershift";
  if (isHeterogeneousJobName(row.name) || row.category === "heterogeneous") {
    return "heterogeneous";
  }
  return "homogeneous";
}

function toJobType(raw: string): JobType {
  const allowed: JobType[] = [
    "e2e",
    "serial",
    "fips",
    "image-ecosystem",
    "upgrade",
    "agent",
    "techpreview",
    "hypershift",
  ];
  return (allowed.includes(raw as JobType) ? raw : "e2e") as JobType;
}

export function loadInventoryJobs(): ZJob[] {
  return (inventory as InventoryRow[])
    .filter((r) => isMonitoredOcpVersion(r.ocpVersion))
    .map((row) => {
      const links = buildJobLinks(row.ocpVersion, row.configFile, row.name);
      const category = toCategory(row);
      const jobType = toJobType(row.jobType);
      // Homogeneous e2e/serial + upgrades are release gates. Heterogeneous /
      // hypershift jobs are watched but must not alone block readiness.
      const requiredForRelease =
        category === "homogeneous" &&
        ["e2e", "upgrade", "serial"].includes(jobType);
      return {
        id: `${row.ocpVersion}::${row.name}::${row.configFile}`,
        name: row.name,
        ocpVersion: row.ocpVersion,
        jobType,
        category,
        configFile: row.configFile,
        configUrl: configGithubUrl(row.configFile),
        periodicName: links.periodicName,
        links,
        upgradeFrom: row.upgradeFrom,
        latestOutcome: "no-data" as const,
        latestRunAt: null,
        latestTestFlakes: null,
        latestTerminalOutcome: null,
        latestTerminalAt: null,
        lastSuccessAt: null,
        lastSuccessSource: null,
        latestDurationMinutes: null,
        consecutiveFailures: 0,
        daysSinceLastSuccess: null,
        neverPassed: false,
        noGreenInLoadedRuns: false,
        passRate7d: null,
        passRate30d: null,
        flakeRate30d: null,
        flakeRate7d: null,
        windowComplete7d: false,
        windowComplete30d: false,
        runs7d: null,
        passes7d: null,
        runs30d: null,
        passes30d: null,
        passRateLastN: null,
        passesLastN: null,
        lastN: null,
        sippyCurrentPassPct: null,
        sippyPreviousPassPct: null,
        sippyCurrentRuns: null,
        prowUrl: links.prowHistory,
        history: [],
        historyFetchedCount: 0,
        owner:
          row.name.includes("ibmcloud")
            ? "ibmcloud-z"
            : category === "upgrade"
              ? "z-upgrade"
              : category === "heterogeneous"
                ? "z-hetero"
                : category === "hypershift"
                  ? "z-hypershift"
                  : "z-libvirt",
        requiredForRelease,
        dataProvenance: "none" as const,
      };
    })
    .sort((a, b) => {
      const va = parseVersion(a.ocpVersion);
      const vb = parseVersion(b.ocpVersion);
      if (va.major !== vb.major) return vb.major - va.major;
      if (va.minor !== vb.minor) return vb.minor - va.minor;
      return a.name.localeCompare(b.name);
    });
}

function versionHealth(jobs: ZJob[]): VersionHealth {
  const withData = jobs.filter((j) => j.dataProvenance !== "none");
  if (!withData.length) return "unknown";
  // Align with computeReadiness: any blocked gate → red; otherwise flaking/non-gate fail → yellow.
  const critical = withData.filter(
    (j) =>
      j.requiredForRelease &&
      (terminalOutcome(j) === "failure" ||
        terminalOutcome(j) === "upgrade" ||
        j.consecutiveFailures >= 3 ||
        j.neverPassed),
  );
  if (critical.length >= 1) return "red";
  if (
    withData.some((j) => {
      const t = terminalOutcome(j);
      return t === "failure" || t === "upgrade" || isStreakFlaking(j);
    })
  ) {
    return "yellow";
  }
  return "green";
}

export function groupByVersion(jobs: ZJob[]): VersionSummary[] {
  const map = new Map<string, ZJob[]>();
  for (const job of jobs) {
    const list = map.get(job.ocpVersion) ?? [];
    list.push(job);
    map.set(job.ocpVersion, list);
  }
  return [...map.entries()]
    .map(([version, versionJobs]) => {
      const sorted = [...versionJobs].sort((a, b) => {
        const sa = severityRank(
          terminalOutcome(a),
          a.consecutiveFailures,
          a.neverPassed,
        );
        const sb = severityRank(
          terminalOutcome(b),
          b.consecutiveFailures,
          b.neverPassed,
        );
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
      const rates = weightedPassRate(sorted, "30d");
      return {
        version,
        health: versionHealth(sorted),
        jobs: sorted,
        passing: sorted.filter((j) => terminalOutcome(j) === "success").length,
        failing: sorted.filter((j) => {
          const t = terminalOutcome(j);
          return t === "failure" || t === "upgrade";
        }).length,
        flaking: sorted.filter((j) => isStreakFlaking(j)).length,
        running: sorted.filter((j) => isInFlightOutcome(j.latestOutcome)).length,
        noData: sorted.filter((j) => j.latestOutcome === "no-data").length,
        passRate30d: rates.passRate == null ? null : Math.round(rates.passRate),
      };
    })
    .sort((a, b) => {
      const va = parseVersion(a.version);
      const vb = parseVersion(b.version);
      if (va.major !== vb.major) return vb.major - va.major;
      return vb.minor - va.minor;
    });
}

export function summarize(jobs: ZJob[]) {
  return {
    total: jobs.length,
    passing: jobs.filter((j) => terminalOutcome(j) === "success").length,
    failing: jobs.filter((j) => {
      const t = terminalOutcome(j);
      return t === "failure" || t === "upgrade";
    }).length,
    flaking: jobs.filter((j) => isStreakFlaking(j)).length,
    running: jobs.filter((j) => isInFlightOutcome(j.latestOutcome)).length,
    noData: jobs.filter((j) => j.latestOutcome === "no-data").length,
    versionsAtRisk: groupByVersion(jobs).filter((v) => v.health === "red" || v.health === "yellow")
      .length,
  };
}
