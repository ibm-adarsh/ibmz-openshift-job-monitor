import type { HistoryWindow, LastSuccessSource, RunHistoryEntry, ZJob } from "../types";
import {
  fetchSippyJobs,
  fetchSippyRuns,
  mapPool,
  mapSippyResult,
  type SippyJobRow,
  type SippyRunRow,
} from "../api/sippyClient";
import {
  fetchProwHistory,
  mapProwResult,
  prowBuildViewUrl,
  type ProwBuild,
} from "../api/prowClient";

const DAY = 86_400_000;
const LAST_N = 10;
const SIPPY_PER_PAGE = 100;

function isInFlight(outcome: RunHistoryEntry["outcome"]): boolean {
  return outcome === "running" || outcome === "pending";
}

/** Outcomes that count toward pass-rate denominator (excludes aborted noise). */
function isScored(outcome: RunHistoryEntry["outcome"]): boolean {
  return ["success", "failure", "flaking", "upgrade"].includes(outcome);
}

function windowStats(runs: RunHistoryEntry[], sinceMs: number | null, limit?: number) {
  let list = runs.filter((r) => {
    if (!isScored(r.outcome)) return false;
    if (sinceMs != null) {
      const t = new Date(r.startedAt).getTime();
      if (Number.isNaN(t) || t < sinceMs) return false;
    }
    return true;
  });
  if (limit != null) list = list.slice(0, limit);
  if (!list.length) {
    return { passRate: null as number | null, passes: null as number | null, total: null as number | null };
  }
  const passes = list.filter((r) => r.outcome === "success").length;
  return {
    passRate: Math.round((passes / list.length) * 1000) / 10,
    passes,
    total: list.length,
  };
}

function flakeRate(runs: RunHistoryEntry[], sinceMs: number): number | null {
  const scored = runs.filter((r) => {
    const t = new Date(r.startedAt).getTime();
    if (Number.isNaN(t) || t < sinceMs) return false;
    return isScored(r.outcome);
  });
  if (!scored.length) return null;
  const flaky = scored.filter((r) => (r.testFlakes ?? 0) > 0 || r.outcome === "flaking").length;
  return Math.round((flaky / scored.length) * 1000) / 10;
}

function consecutiveFailures(runs: RunHistoryEntry[]): number {
  let n = 0;
  for (const run of runs) {
    if (isInFlight(run.outcome)) continue;
    if (run.outcome === "success") break;
    if (run.outcome === "failure" || run.outcome === "upgrade" || run.outcome === "aborted") {
      n += 1;
    } else {
      break;
    }
  }
  return n;
}

/** True if oldest scored run is at/before the window start (or we hit the fetch cap with older data). */
function windowLooksComplete(runs: RunHistoryEntry[], sinceMs: number, fetchedCount: number): boolean {
  const scored = runs.filter((r) => isScored(r.outcome));
  if (!scored.length) return false;
  const oldest = scored.reduce((min, r) => {
    const t = new Date(r.startedAt).getTime();
    return Number.isNaN(t) ? min : Math.min(min, t);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(oldest)) return false;
  // Covered past the window start, or fetch was saturated so older days may exist but we tried.
  return oldest <= sinceMs || fetchedCount >= SIPPY_PER_PAGE;
}

function fromProw(builds: ProwBuild[], periodicName: string): RunHistoryEntry[] {
  return builds.map((b) => ({
    id: b.ID,
    outcome: mapProwResult(b.Result),
    startedAt: b.Started,
    durationMinutes: b.Duration ? Math.round(b.Duration / 1e9 / 60) : null,
    prowUrl: prowBuildViewUrl(periodicName, b.ID),
    commitSha: "",
    source: "prow" as const,
    rawResult: b.Result,
  }));
}

function fromSippy(runs: SippyRunRow[], periodicName: string): RunHistoryEntry[] {
  return runs.map((r) => {
    const id = String(r.prow_id ?? r.id);
    return {
      id,
      outcome: mapSippyResult(r.overall_result, r),
      startedAt: new Date(r.timestamp).toISOString(),
      durationMinutes: null,
      prowUrl:
        r.url ||
        `https://prow.ci.openshift.org/view/gs/test-platform-results/logs/${periodicName}/${id}`,
      commitSha: "",
      source: "sippy" as const,
      rawResult: r.overall_result,
      testFlakes: r.test_flakes ?? 0,
    };
  });
}

/** Display helper — filter full history for sparkline without refetching. */
export function applyHistoryWindow(
  history: RunHistoryEntry[],
  window: HistoryWindow,
): RunHistoryEntry[] {
  if (window === "last-10") return history.slice(0, LAST_N);
  const since = Date.now() - 30 * DAY;
  return history.filter((r) => {
    const t = new Date(r.startedAt).getTime();
    return !Number.isNaN(t) && t >= since;
  });
}

async function loadHistory(
  job: ZJob,
  signal?: AbortSignal,
): Promise<{
  fullHistory: RunHistoryEntry[];
  source: "prow" | "sippy" | "none";
  error?: string;
}> {
  let prowErr: string | undefined;

  if (import.meta.env.DEV) {
    try {
      const builds = await fetchProwHistory(job.periodicName, signal);
      if (builds.length) {
        return {
          fullHistory: fromProw(builds, job.periodicName),
          source: "prow",
        };
      }
    } catch (e) {
      prowErr = e instanceof Error ? e.message : String(e);
    }
  }

  try {
    const runs = await fetchSippyRuns(job.ocpVersion, job.periodicName, SIPPY_PER_PAGE, signal);
    if (runs.length) {
      return {
        fullHistory: fromSippy(runs, job.periodicName),
        source: "sippy",
        error: prowErr ? `Prow proxy unavailable; using Sippy runs` : undefined,
      };
    }
    return {
      fullHistory: [],
      source: "none",
      error: prowErr ? `Prow: ${prowErr}; Sippy: no runs` : "Sippy: no runs",
    };
  } catch (e2) {
    const sippyErr = e2 instanceof Error ? e2.message : String(e2);
    return {
      fullHistory: [],
      source: "none",
      error: prowErr ? `Prow: ${prowErr}; Sippy: ${sippyErr}` : sippyErr,
    };
  }
}

export interface LiveLoadProgress {
  phase: string;
  done: number;
  total: number;
}

export async function hydrateJobsLive(
  inventory: ZJob[],
  onProgress?: (p: LiveLoadProgress) => void,
  signal?: AbortSignal,
): Promise<ZJob[]> {
  const versions = [...new Set(inventory.map((j) => j.ocpVersion))];
  onProgress?.({
    phase: "Fetching Sippy job stats…",
    done: 0,
    total: versions.length,
  });

  const sippyByRelease = new Map<string, Map<string, SippyJobRow>>();
  await mapPool(versions, 4, async (release, idx) => {
    try {
      const rows = await fetchSippyJobs(release, signal);
      const map = new Map<string, SippyJobRow>();
      for (const row of rows) {
        if (row.name) map.set(row.name, row);
      }
      sippyByRelease.set(release, map);
    } catch {
      sippyByRelease.set(release, new Map());
    }
    onProgress?.({
      phase: "Fetching Sippy job stats…",
      done: idx + 1,
      total: versions.length,
    });
  });

  onProgress?.({ phase: "Fetching run history…", done: 0, total: inventory.length });

  let completed = 0;
  const enriched = await mapPool(inventory, 6, async (job) => {
    const sippy = sippyByRelease.get(job.ocpVersion)?.get(job.periodicName);
    const { fullHistory, error } = await loadHistory(job, signal);
    completed += 1;
    onProgress?.({
      phase: "Fetching run history…",
      done: completed,
      total: inventory.length,
    });

    const now = Date.now();
    const s7 = windowStats(fullHistory, now - 7 * DAY);
    const s30 = windowStats(fullHistory, now - 30 * DAY);
    const sN = windowStats(fullHistory, null, LAST_N);

    const latest = fullHistory[0];
    const latestTerminal = fullHistory.find((h) => !isInFlight(h.outcome));

    const historySuccessAt =
      fullHistory.find(
        (h) => h.outcome === "success" || h.rawResult === "S" || h.rawResult === "s",
      )?.startedAt ?? null;
    const sippyPass = sippy?.last_pass || null;
    let lastSuccessAt: string | null = historySuccessAt;
    let lastSuccessSource: LastSuccessSource = historySuccessAt ? "history" : null;
    if (!lastSuccessAt && sippyPass) {
      lastSuccessAt = sippyPass;
      lastSuccessSource = "sippy";
    }

    const daysSinceLastSuccess = lastSuccessAt
      ? Math.floor((now - new Date(lastSuccessAt).getTime()) / DAY)
      : null;

    // Confident never-passed only when Sippy aggregate says so (or no Sippy and we have deep history with zero greens).
    const neverPassed = sippy
      ? !sippy.last_pass && !historySuccessAt
      : fullHistory.length >= SIPPY_PER_PAGE && !historySuccessAt;
    const noGreenInLoadedRuns = fullHistory.length > 0 && !historySuccessAt;

    const hasRuns = fullHistory.length > 0;
    const hasSippy = !!sippy;

    const pass7d =
      s7.passRate ??
      (hasSippy && sippy?.current_runs && sippy.current_pass_percentage != null
        ? Math.round(sippy.current_pass_percentage * 10) / 10
        : null);
    const runs7dVal =
      s7.total ??
      (hasSippy && sippy?.current_runs != null ? sippy.current_runs : null);
    const passes7dVal =
      s7.passes ??
      (runs7dVal != null && pass7d != null
        ? Math.round((runs7dVal * pass7d) / 100)
        : null);
    const pass30d =
      s30.passRate ??
      (hasSippy && sippy?.previous_runs && sippy.previous_pass_percentage != null
        ? Math.round(sippy.previous_pass_percentage * 10) / 10
        : null);
    const runs30dVal =
      s30.total ??
      (hasSippy && sippy?.previous_runs != null ? sippy.previous_runs : null);
    const passes30dVal =
      s30.passes ??
      (runs30dVal != null && pass30d != null
        ? Math.round((runs30dVal * pass30d) / 100)
        : null);

    return {
      ...job,
      latestOutcome: latest?.outcome ?? (hasSippy ? "unknown" : "no-data"),
      latestRunAt: latest?.startedAt ?? null,
      latestTestFlakes: latest?.testFlakes ?? null,
      latestTerminalOutcome: latestTerminal?.outcome ?? null,
      latestTerminalAt: latestTerminal?.startedAt ?? null,
      lastSuccessAt,
      lastSuccessSource,
      latestDurationMinutes:
        latest?.durationMinutes ?? sippy?.current_average_duration_minutes ?? null,
      consecutiveFailures: fullHistory.length ? consecutiveFailures(fullHistory) : 0,
      daysSinceLastSuccess,
      neverPassed,
      noGreenInLoadedRuns,
      passRate7d: pass7d,
      passRate30d: pass30d,
      flakeRate30d: flakeRate(fullHistory, now - 30 * DAY),
      flakeRate7d: flakeRate(fullHistory, now - 7 * DAY),
      windowComplete7d: windowLooksComplete(fullHistory, now - 7 * DAY, fullHistory.length),
      windowComplete30d: windowLooksComplete(fullHistory, now - 30 * DAY, fullHistory.length),
      runs7d: runs7dVal,
      passes7d: passes7dVal,
      runs30d: runs30dVal,
      passes30d: passes30dVal,
      passRateLastN: sN.passRate,
      passesLastN: sN.passes,
      lastN: sN.total,
      sippyCurrentPassPct:
        sippy?.current_pass_percentage != null
          ? Math.round(sippy.current_pass_percentage * 10) / 10
          : null,
      sippyPreviousPassPct:
        sippy?.previous_pass_percentage != null
          ? Math.round(sippy.previous_pass_percentage * 10) / 10
          : null,
      sippyCurrentRuns: sippy?.current_runs ?? null,
      history: fullHistory,
      historyFetchedCount: fullHistory.length,
      links: {
        ...job.links,
        testgrid: sippy?.test_grid_url || job.links.testgrid,
      },
      prowUrl: latest?.prowUrl || job.prowUrl,
      dataProvenance: hasRuns ? "live" : hasSippy ? "partial" : "none",
      liveError: error,
    } satisfies ZJob;
  });

  return enriched;
}
