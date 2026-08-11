import type { JobOutcome } from "../types";

export interface ProwBuild {
  ID: string;
  Started: string;
  Duration: number; // nanoseconds
  Result: string;
  SpyglassLink?: string;
}

function prowBase(): string {
  if (import.meta.env.DEV) {
    return "/proxy/prow";
  }
  // Direct Prow HTML has no reliable CORS — only usable via proxy in dev.
  return "https://prow.ci.openshift.org";
}

export function mapProwResult(result: string): JobOutcome {
  switch ((result || "").toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "ABORTED":
      return "aborted";
    case "PENDING":
      return "pending";
    case "RUNNING":
    case "TRIGGERED":
      return "running";
    default:
      return "unknown";
  }
}

/** Parse Deck job-history page embedded `allBuilds = [...]`. */
export function parseProwAllBuilds(html: string): ProwBuild[] {
  const m = html.match(/allBuilds\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]) as ProwBuild[];
  } catch {
    return [];
  }
}

export async function fetchProwHistory(
  periodicName: string,
  signal?: AbortSignal,
): Promise<ProwBuild[]> {
  const path = `/job-history/gs/test-platform-results/logs/${encodeURIComponent(periodicName)}`;
  const res = await fetch(`${prowBase()}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`Prow history ${periodicName}: HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseProwAllBuilds(html);
}

export function prowBuildViewUrl(periodicName: string, buildId: string): string {
  return `https://prow.ci.openshift.org/view/gs/test-platform-results/logs/${periodicName}/${buildId}`;
}
