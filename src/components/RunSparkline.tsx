import type { JobOutcome, RunHistoryEntry } from "../types";

const COLOR: Record<JobOutcome, string> = {
  success: "var(--ibmz-spark-success)",
  failure: "var(--ibmz-spark-failure)",
  flaking: "var(--ibmz-spark-flaking)",
  upgrade: "var(--ibmz-spark-upgrade)",
  running: "var(--ibmz-spark-running)",
  aborted: "var(--ibmz-spark-aborted)",
  pending: "var(--ibmz-spark-pending)",
  unknown: "var(--ibmz-spark-unknown)",
  "no-data": "var(--ibmz-spark-unknown)",
};

const PULSE_STYLE = `
@keyframes pf-sparkline-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

if (typeof document !== "undefined" && !document.getElementById("pf-sparkline-pulse")) {
  const s = document.createElement("style");
  s.id = "pf-sparkline-pulse";
  s.textContent = PULSE_STYLE;
  document.head.appendChild(s);
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface RunSparklineProps {
  history: RunHistoryEntry[];
  /** Maximum bars to show — default 20 */
  maxRuns?: number;
  /** Total fetched before windowing (for “showing N of M”). */
  totalFetched?: number;
  /** Show "oldest … newest →" axis label */
  showAxis?: boolean;
}

export function RunSparkline({
  history,
  maxRuns = 20,
  totalFetched,
  showAxis = false,
}: RunSparklineProps) {
  // history[0] = newest; reverse so oldest is leftmost
  const windowed = history;
  const runs = [...windowed].slice(0, maxRuns).reverse();
  const newestOutcome = runs[runs.length - 1]?.outcome;
  const oldestDate = runs[0] ? fmt(runs[0].startedAt) : null;
  const shown = runs.length;
  const total = totalFetched ?? windowed.length;

  return (
    <div>
      <div
        style={{ display: "flex", gap: 2, alignItems: "flex-end" }}
        aria-label={`Last ${runs.length} run outcomes`}
      >
        {runs.map((run, idx) => {
          const isRunning = run.outcome === "running" || run.outcome === "pending";
          const isNewest = idx === runs.length - 1;
          const tip = [
            run.outcome.toUpperCase(),
            fmt(run.startedAt),
            run.durationMinutes != null ? `${run.durationMinutes}m` : null,
            run.rawResult ? `raw: ${run.rawResult}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <a
              key={run.id}
              href={run.prowUrl}
              target="_blank"
              rel="noreferrer"
              title={tip}
              style={{
                width: 12,
                height: 24,
                borderRadius: 2,
                background: COLOR[run.outcome],
                display: "inline-block",
                flexShrink: 0,
                animation: isRunning ? "pf-sparkline-pulse 1.4s ease-in-out infinite" : undefined,
                outline: isNewest
                  ? "2px solid var(--pf-t--global--border--color--default)"
                  : undefined,
                outlineOffset: 1,
              }}
            />
          );
        })}
        {newestOutcome === "running" && (
          <span
            style={{
              marginLeft: 4,
              fontSize: "var(--pf-t--global--font--size--xs)",
              color: "var(--ibmz-info-strong)",
              fontWeight: 600,
            }}
          >
            LIVE
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--pf-t--global--font--size--xs)",
          color: "var(--pf-t--global--text--color--subtle)",
          marginTop: 3,
          gap: 8,
        }}
      >
        <span>
          {shown < total ? `Showing ${shown} of ${total}` : `${shown} run${shown === 1 ? "" : "s"}`}
          {" · newest →"}
        </span>
        {showAxis && oldestDate && <span>{oldestDate}</span>}
      </div>
    </div>
  );
}
