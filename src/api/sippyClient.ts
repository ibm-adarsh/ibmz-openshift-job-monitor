import type { JobOutcome } from "../types";

const SIPPY_DIRECT = "https://sippy.dptools.openshift.org";

/** Sippy sends Access-Control-Allow-Origin: * — call it directly. */
function sippyBase(): string {
  return SIPPY_DIRECT;
}

export interface SippyJobRow {
  name: string;
  brief_name?: string;
  last_pass?: string | null;
  current_pass_percentage?: number;
  current_runs?: number;
  current_passes?: number;
  current_fails?: number;
  previous_pass_percentage?: number;
  previous_runs?: number;
  previous_passes?: number;
  previous_fails?: number;
  current_average_duration_minutes?: number;
  test_grid_url?: string;
}

export interface SippyRunRow {
  id: number | string;
  prow_id?: string;
  job: string;
  url?: string;
  timestamp: number; // ms
  overall_result: string;
  succeeded?: boolean;
  failed?: boolean;
  infrastructure_failure?: boolean;
  test_flakes?: number;
  test_failures?: number;
}

export interface SippyRunsResponse {
  rows?: SippyRunRow[];
}

export function mapSippyResult(code: string, run?: SippyRunRow): JobOutcome {
  const c = (code || "").trim();
  // Sippy overall_result: S=success, F/f=fail, A=aborted, R=running, U=upgrade failure, I/N/n=install/infra-ish
  if (c === "R") return "running";
  if (c === "A" || c.toLowerCase() === "aborted") return "aborted";
  if (c === "U") return "upgrade";
  // Overall success (S) = pass for status/streak/pass-rate even when individual tests flaked.
  if (c === "S" || run?.succeeded) return "success";
  if (["F", "f", "I", "N", "n"].includes(c)) return "failure";
  if (run?.failed || run?.infrastructure_failure) return "failure";
  return "unknown";
}

/** Runs with flaky tests but overall Sippy success — used for flake-rate metrics only. */
export function sippyRunHadFlakes(run?: SippyRunRow): boolean {
  return (run?.test_flakes ?? 0) > 0;
}

async function fetchJsonWithRetry<T>(
  url: string,
  signal?: AbortSignal,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchSippyJobs(release: string, signal?: AbortSignal): Promise<SippyJobRow[]> {
  const url = `${sippyBase()}/api/jobs?release=${encodeURIComponent(release)}`;
  const data = await fetchJsonWithRetry<unknown>(url, signal);
  if (!Array.isArray(data)) {
    throw new Error(`Sippy jobs ${release}: unexpected payload`);
  }
  return data as SippyJobRow[];
}

export async function fetchSippyRuns(
  release: string,
  jobName: string,
  perPage = 40,
  signal?: AbortSignal,
): Promise<SippyRunRow[]> {
  const filter = {
    items: [{ columnField: "job", operatorValue: "equals", value: jobName }],
  };
  const params = new URLSearchParams({
    release,
    filter: JSON.stringify(filter),
    perPage: String(perPage),
    sortField: "timestamp",
    sort: "desc",
  });
  const url = `${sippyBase()}/api/jobs/runs?${params.toString()}`;
  const data = await fetchJsonWithRetry<SippyRunsResponse>(url, signal);
  return Array.isArray(data.rows) ? data.rows : [];
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const agents = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(agents);
  return results;
}
