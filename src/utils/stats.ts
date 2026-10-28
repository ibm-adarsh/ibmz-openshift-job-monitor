import type { JobOutcome, ZJob, VersionSummary } from "../types";

export const STREAK_FLAKE_PASS_RATE_THRESHOLD = 25;

/** Last finished outcome — use for pass/fail counts and readiness (not in-flight runs). */
export function terminalOutcome(job: ZJob): JobOutcome {
  return job.latestTerminalOutcome ?? job.latestOutcome;
}

/** Status column: in-flight shows Running/Pending; otherwise last finished outcome. */
export function statusOutcomeForJob(job: ZJob): JobOutcome {
  if (isInFlightOutcome(job.latestOutcome)) return job.latestOutcome;
  return terminalOutcome(job);
}

/**
 * Flaking under Streak: last finished run passed but pass rate in 7d or 30d is ≤25%.
 */
export function isStreakFlaking(job: ZJob): boolean {
  if (terminalOutcome(job) !== "success") return false;
  const lowPass = (rate: number | null, total: number | null) =>
    rate != null && total != null && total > 0 && rate <= STREAK_FLAKE_PASS_RATE_THRESHOLD;
  return lowPass(job.passRate7d, job.runs7d) || lowPass(job.passRate30d, job.runs30d);
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
    hypershift: jobs.filter((j) => j.category === "hypershift").length,
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
      isStreakFlaking(j) ||
      j.consecutiveFailures >= 1 ||
      (j.daysSinceLastSuccess != null && j.daysSinceLastSuccess > 7),
  );
  if (atRisk.length > 0) return "at-risk";
  return "ready";
}

export function fleetHeadline(
  versions: VersionSummary[],
): { tone: "success" | "warning" | "danger" | "unknown"; text: string; detail: string } {
  if (!versions.length) {
    return {
      tone: "unknown",
      text: "No OCP versions in view",
      detail: "Adjust filters or wait for the job inventory to load.",
    };
  }
  const signals = versions.map(computeReadiness);
  const blocked = signals.filter((s) => s === "blocked").length;
  const atRisk = signals.filter((s) => s === "at-risk").length;
  const ready = signals.filter((s) => s === "ready").length;
  const noData = signals.filter((s) => s === "no-data").length;
  if (blocked > 0) {
    return {
      tone: "danger",
      text: `${blocked} of ${versions.length} OCP versions are blocked`,
      detail:
        "Blocked means at least one release-gate job (homogeneous e2e/serial or upgrade) is failing, has 3+ consecutive failures, or has never passed. " +
        `${ready} ready · ${atRisk} at risk · ${noData} without enough data.`,
    };
  }
  if (atRisk > 0) {
    return {
      tone: "warning",
      text: `${atRisk} of ${versions.length} OCP versions are at risk`,
      detail:
        "At risk means a gate job is flaking, had a recent failure, or has not been green for more than 7 days. " +
        `${ready} ready · ${noData} without enough data.`,
    };
  }
  if (ready > 0 && noData === 0) {
    return {
      tone: "success",
      text: `All ${ready} OCP versions look ready`,
      detail: "Homogeneous e2e/serial and upgrade gate jobs are healthy for every monitored version.",
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
