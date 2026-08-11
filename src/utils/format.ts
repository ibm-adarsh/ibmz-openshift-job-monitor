/** Relative time helpers for the dashboard. */

export function formatAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  return formatAbsolute(iso);
}

export function severityRank(
  outcome: string,
  consecutiveFailures: number,
  neverPassed: boolean,
): number {
  if (outcome === "no-data") return 6;
  if (neverPassed && outcome !== "success") return 0;
  if (consecutiveFailures >= 3 || outcome === "failure") return 1;
  if (outcome === "flaking" || outcome === "aborted") return 2;
  if (outcome === "running" || outcome === "pending") return 3;
  if (outcome === "unknown") return 4;
  return 5; // success
}
