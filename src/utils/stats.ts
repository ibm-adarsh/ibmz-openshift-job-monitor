import type { JobOutcome, ZJob, VersionSummary } from "../types";

/** Last finished outcome — use for pass/fail counts and readiness (not in-flight runs). */
export function terminalOutcome(job: ZJob): JobOutcome {
  return job.latestTerminalOutcome ?? job.latestOutcome;
}

export function isInFlightOutcome(outcome: JobOutcome): boolean {
  return outcome === "running" || outcome === "pending";
}

/** Row tint / sort priority when a newer build is still running. */
export function displayOutcomeForRow(job: ZJob): JobOutcome {
  if (isInFlightOutcome(job.latestOutcome) && job.latestTerminalOutcome) {
    return job.latestTerminalOutcome;
  }
  return job.latestOutcome;
}

export interface WeightedPassRate {
  passRate: number | null;
  passes: number;
  total: number;
}

/** Run-weighted pass rate — not an average of job percentages. */
export function weightedPassRate(
  jobs: ZJob[],
  window: "7d" | "30d",
): WeightedPassRate {
  const passesKey = window === "7d" ? "passes7d" : "passes30d";
  const runsKey = window === "7d" ? "runs7d" : "runs30d";
  let passes = 0;
  let total = 0;
  for (const j of jobs) {
    const p = j[passesKey];
    const t = j[runsKey];
    if (p != null && t != null && t > 0) {
      passes += p;
      total += t;
    }
  }
  if (!total) return { passRate: null, passes: 0, total: 0 };
  return {
    passRate: Math.round((passes / total) * 1000) / 10,
    passes,
    total,
  };
}

export function categoryCounts(jobs: ZJob[]) {
  return {
    homogeneous: jobs.filter((j) => j.category === "homogeneous").length,
    heterogeneous: jobs.filter((j) => j.category === "heterogeneous").length,
    upgrade: jobs.filter((j) => j.category === "upgrade").length,
  };
}

export type ReadinessSignal = "ready" | "at-risk" | "blocked" | "no-data";

export function computeReadiness(v: VersionSummary): ReadinessSignal {
  if (v.jobs.every((j) => j.dataProvenance === "none")) return "no-data";
  const required = v.jobs.filter((j) => j.requiredForRelease);
  if (!required.length) return "no-data";
  const blocked = required.filter(
    (j) =>
      terminalOutcome(j) === "failure" ||
      terminalOutcome(j) === "upgrade" ||
      j.consecutiveFailures >= 3 ||
      (j.neverPassed && j.dataProvenance !== "none"),
  );
  if (blocked.length > 0) return "blocked";
  const atRisk = required.filter(
    (j) =>
      terminalOutcome(j) === "flaking" ||
      j.consecutiveFailures >= 1 ||
      (j.daysSinceLastSuccess != null && j.daysSinceLastSuccess > 7),
  );
  if (atRisk.length > 0) return "at-risk";
  return "ready";
}

export function fleetHeadline(
  versions: VersionSummary[],
): { tone: "success" | "warning" | "danger" | "unknown"; text: string; detail: string } {
  const active = versions.filter((v) => !v.eos);
  if (!active.length) {
    return {
      tone: "unknown",
      text: "No supported OCP versions in view",
      detail: "EOS (end-of-support) versions are excluded from this summary.",
    };
  }
  const signals = active.map(computeReadiness);
  const blocked = signals.filter((s) => s === "blocked").length;
  const atRisk = signals.filter((s) => s === "at-risk").length;
  const ready = signals.filter((s) => s === "ready").length;
  const noData = signals.filter((s) => s === "no-data").length;
  if (blocked > 0) {
    return {
      tone: "danger",
      text: `${blocked} of ${active.length} OCP versions are blocked`,
      detail:
        "Blocked means at least one required release-gate job is failing, has 3+ consecutive failures, or has never passed. " +
        `${ready} ready · ${atRisk} at risk · ${noData} without enough data.`,
    };
  }
  if (atRisk > 0) {
    return {
      tone: "warning",
      text: `${atRisk} of ${active.length} OCP versions are at risk`,
      detail:
        "At risk means a gate job is flaking, had a recent failure, or has not been green for more than 7 days. " +
        `${ready} ready · ${noData} without enough data.`,
    };
  }
  if (ready > 0 && noData === 0) {
    return {
      tone: "success",
      text: `All ${ready} OCP versions look ready`,
      detail: "Required release-gate jobs are currently healthy for every supported version.",
    };
  }
  if (ready > 0) {
    return {
      tone: "success",
      text: `${ready} OCP versions ready · ${noData} still loading data`,
      detail: "Some versions do not yet have enough live CI history to judge readiness.",
    };
  }
  return {
    tone: "unknown",
    text: "Waiting on live CI data",
    detail: "Sippy/Prow have not returned enough runs yet to score versions.",
  };
}
