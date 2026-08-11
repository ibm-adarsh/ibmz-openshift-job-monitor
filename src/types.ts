export type JobOutcome =
  | "success"
  | "failure"
  | "flaking"
  | "upgrade"
  | "running"
  | "aborted"
  | "pending"
  | "unknown"
  | "no-data";

export type JobType =
  | "e2e"
  | "serial"
  | "fips"
  | "image-ecosystem"
  | "upgrade"
  | "agent"
  | "techpreview";

/** High-level job family for filtering.
 * Heterogeneous = only *-x-xz / *-z-xz topologies (not multi-z-z or s390x-only).
 */
export type JobCategory =
  | "all"
  | "homogeneous"
  | "heterogeneous"
  | "upgrade";

export type DataProvenance = "live" | "partial" | "none";

/** Where last-success timestamp came from. */
export type LastSuccessSource = "history" | "sippy" | null;

/** How much run history to show in the sparkline (display only). */
export type HistoryWindow = "last-10" | "last-30-days";

export interface RunHistoryEntry {
  id: string;
  outcome: JobOutcome;
  startedAt: string;
  durationMinutes: number | null;
  prowUrl: string;
  commitSha: string;
  source: "prow" | "sippy";
  rawResult: string;
  /** Flaky tests in this run (Sippy); overall job may still have passed. */
  testFlakes?: number;
}

export interface JobExternalLinks {
  periodicName: string;
  variant: string;
  prowHistory: string;
  prowDeck: string;
  config: string;
  sippy: string;
  testgrid: string;
}

export interface ZJob {
  id: string;
  name: string;
  ocpVersion: string;
  jobType: JobType;
  category: Exclude<JobCategory, "all">;
  configFile: string;
  configUrl: string;
  periodicName: string;
  links: JobExternalLinks;
  upgradeFrom: string | null;
  /** Newest run including running/pending. */
  latestOutcome: JobOutcome;
  latestRunAt: string | null;
  /** Flaky test count on the newest run (when Sippy overall_result was still success). */
  latestTestFlakes: number | null;
  /** Newest finished (non-running) outcome — use for “last run passed/failed”. */
  latestTerminalOutcome: JobOutcome | null;
  latestTerminalAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessSource: LastSuccessSource;
  latestDurationMinutes: number | null;
  consecutiveFailures: number;
  daysSinceLastSuccess: number | null;
  /** True only when Sippy reports no last_pass (confident never-green). */
  neverPassed: boolean;
  /** True when loaded run history has no success (may still have Sippy last_pass). */
  noGreenInLoadedRuns: boolean;
  passRate7d: number | null;
  passRate30d: number | null;
  flakeRate30d: number | null;
  flakeRate7d: number | null;
  /** Whether loaded runs appear to cover the full calendar window. */
  windowComplete7d: boolean;
  windowComplete30d: boolean;
  /** Counted runs for pass% (excludes aborted). */
  runs7d: number | null;
  passes7d: number | null;
  runs30d: number | null;
  passes30d: number | null;
  passRateLastN: number | null;
  passesLastN: number | null;
  lastN: number | null;
  sippyCurrentPassPct: number | null;
  sippyPreviousPassPct: number | null;
  sippyCurrentRuns: number | null;
  prowUrl: string;
  /** Full fetched history (newest first). Sparkline may show a subset. */
  history: RunHistoryEntry[];
  historyFetchedCount: number;
  owner: string;
  requiredForRelease: boolean;
  dataProvenance: DataProvenance;
  liveError?: string;
}

export type VersionHealth = "green" | "yellow" | "red" | "unknown";

export interface VersionSummary {
  version: string;
  eos: boolean;
  health: VersionHealth;
  jobs: ZJob[];
  passing: number;
  failing: number;
  flaking: number;
  running: number;
  noData: number;
  passRate30d: number | null;
}
