import { Button, Flex, Label, LabelGroup, Tooltip } from "@patternfly/react-core";
import {
  ExternalLinkAltIcon,
  StarIcon,
  OutlinedStarIcon,
} from "@patternfly/react-icons";
import { useLayoutEffect, useRef, useState } from "react";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import type { HistoryWindow, ZJob } from "../types";
import { StatusLabel } from "./StatusLabel";
import { RunSparkline } from "./RunSparkline";
import { PassRatePair } from "./PassRatePair";
import { formatRelative } from "../utils/format";
import { isHeterogeneousJobName } from "../data/inventory";
import { applyHistoryWindow } from "../data/hydrateLive";
import { displayOutcomeForRow, statusOutcomeForJob, isStreakFlaking, STREAK_FLAKE_PASS_RATE_THRESHOLD } from "../utils/stats";

const CATEGORY_LABEL: Record<ZJob["category"], string> = {
  homogeneous: "Homogeneous",
  heterogeneous: "Heterogeneous",
  upgrade: "Upgrade",
};

function JobFamilyLabels({ job }: { job: ZJob }) {
  // Avoid duplicate "upgrade" + "Upgrade" on upgrade jobs.
  if (job.category === "upgrade") {
    return (
      <>
        <Label isCompact color="purple">
          Upgrade
        </Label>
        {job.upgradeFrom && (
          <Label isCompact color="purple">
            from {job.upgradeFrom}
          </Label>
        )}
      </>
    );
  }
  return (
    <>
      <Label isCompact color="blue">
        {job.jobType}
      </Label>
      <Label isCompact color={job.category === "heterogeneous" ? "purple" : "grey"}>
        {CATEGORY_LABEL[job.category]}
      </Label>
      <TopologyBadge job={job} />
    </>
  );
}

function rowBg(job: ZJob): string | undefined {
  const outcome = displayOutcomeForRow(job);
  if (outcome === "failure" || outcome === "upgrade") return "var(--ibmz-danger-soft)";
  if (outcome === "flaking") return "var(--ibmz-warning-soft)";
  return undefined;
}

function TopologyBadge({ job }: { job: ZJob }) {
  if (!isHeterogeneousJobName(job.name)) return null;
  const topo = job.name.endsWith("-x-xz") ? "x-xz" : "z-xz";
  return (
    <Tooltip
      content={
        topo === "x-xz"
          ? "x86 control plane + Z workers"
          : "Z control plane + x86 workers"
      }
    >
      <Label isCompact color="purple">
        {topo}
      </Label>
    </Tooltip>
  );
}

function ConsecutiveBadge({ job }: { job: ZJob }) {
  if (job.dataProvenance === "none") {
    return (
      <span style={{ color: "var(--pf-t--global--text--color--subtle)" }}>—</span>
    );
  }
  if (job.neverPassed) {
    return (
      <Tooltip content="Sippy has no recorded last_pass for this job — it has never gone green in Sippy’s view.">
        <Label color="red" isCompact>
          Never passed
        </Label>
      </Tooltip>
    );
  }
  if (job.noGreenInLoadedRuns && !job.lastSuccessAt) {
    return (
      <Tooltip content="No successful run in the loaded history window (does not prove the job never passed).">
        <Label color="orange" isCompact>
          No green in loaded runs
        </Label>
      </Tooltip>
    );
  }
  if (job.consecutiveFailures >= 3) {
    return (
      <Label color="red" isCompact>
        {job.consecutiveFailures}× fail
      </Label>
    );
  }
  if (job.consecutiveFailures > 0) {
    return (
      <Label color="orange" isCompact>
        {job.consecutiveFailures}× fail
      </Label>
    );
  }
  const flaking = isStreakFlaking(job);
  if (flaking) {
    const tip =
      `Last finished run passed, but pass rate is ≤${STREAK_FLAKE_PASS_RATE_THRESHOLD}% in the last 7 or 30 days ` +
      `(7d: ${job.passRate7d ?? "—"}% · 30d: ${job.passRate30d ?? "—"}%).`;
    return (
      <Flex direction={{ default: "column" }} gap={{ default: "gapXs" }}>
        <Label color="green" isCompact>OK</Label>
        <Tooltip content={tip}>
          <Label color="orange" isCompact style={{ cursor: "help" }}>
            Flaking
          </Label>
        </Tooltip>
      </Flex>
    );
  }
  return (
    <Label color="green" isCompact>
      OK
    </Label>
  );
}

function SlaBadge({ job }: { job: ZJob }) {
  const days = job.daysSinceLastSuccess;
  if (days == null) return null;
  if (days > 14) {
    return (
      <Tooltip content={`${days} days since last green run — exceeds 14-day SLA`}>
        <Label color="red" isCompact>
          {days}d gap ⚠
        </Label>
      </Tooltip>
    );
  }
  if (days > 7) {
    return (
      <Tooltip content={`${days} days since last green run`}>
        <Label color="orange" isCompact>
          {days}d gap
        </Label>
      </Tooltip>
    );
  }
  return null;
}

/** Returns anomaly string if latest duration is >1.8× median, else null */
function durAnomaly(job: ZJob): string | null {
  const latest = job.latestDurationMinutes;
  if (latest == null || job.history.length < 4) return null;
  const durations = job.history
    .map((h) => h.durationMinutes)
    .filter((d): d is number => d != null);
  if (durations.length < 4) return null;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return null;
  const ratio = latest / median;
  if (ratio > 1.8) {
    return `${latest}m is ${ratio.toFixed(1)}× median ${median}m — possible timeout risk`;
  }
  return null;
}

interface JobTableProps {
  jobs: ZJob[];
  onSelectJob: (job: ZJob) => void;
  watchlist: Set<string>;
  onToggleWatch: (id: string) => void;
  historyWindow: HistoryWindow;
}

export function JobTable({
  jobs,
  onSelectJob,
  watchlist,
  onToggleWatch,
  historyWindow,
}: JobTableProps) {
  const showLastN = historyWindow === "last-10";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerStuck, setHeaderStuck] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => setHeaderStuck(el.scrollTop > 0);
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [jobs.length]);

  return (
    <div className="ibmz-job-table-wrap">
      <div className="ibmz-job-table-scroll" ref={scrollRef}>
        <Table
          aria-label="IBM Z jobs"
          variant="compact"
          isStickyHeaderBase
          isStickyHeaderStuck={headerStuck}
        >
        <Thead>
          <Tr>
            <Th screenReaderText="Watchlist" style={{ width: "2.75rem" }} />
            <Th style={{ width: "28%" }}>
              <Tooltip content="Job name, job type, and category (homogeneous, heterogeneous, or upgrade).">
                <span className="ibmz-th-hint">Job</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "11%" }}>
              <Tooltip content="Latest run result. If a run is still in progress, Prev shows the last finished result.">
                <span className="ibmz-th-hint">Latest Run Status</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "10rem", minWidth: "10rem" }}>
              <Tooltip content="When this job last passed (from run history or Sippy last_pass).">
                <span className="ibmz-th-hint">Last green</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "9rem", minWidth: "8.5rem" }} className="ibmz-col-streak">
              <Tooltip content="Consecutive failed finished runs, or Never passed when Sippy has no last_pass.">
                <span className="ibmz-th-hint">Streak</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "12rem", minWidth: "11rem" }}>
              <Tooltip content="Passed/Total %. Green ≥85%, amber ≥60%, red <60%. Aborted runs are excluded.">
                <span className="ibmz-th-hint">Pass rate</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "14rem", minWidth: "12rem" }}>
              <Tooltip
                content={
                  showLastN
                    ? "Bars for the last 10 runs — oldest on the left, newest on the right (outlined bar = newest)"
                    : "Bars for runs in the last 30 days"
                }
              >
                <span className="ibmz-th-hint">Runs</span>
              </Tooltip>
            </Th>
            <Th modifier="nowrap" style={{ width: "5.5rem" }} className="ibmz-col-links">
              <Tooltip content="Open Prow history, Sippy runs, or the job config in GitHub.">
                <span className="ibmz-th-hint">Links</span>
              </Tooltip>
            </Th>
          </Tr>
        </Thead>
      <Tbody>
        {jobs.map((job) => {
          const isWatched = watchlist.has(job.id);
          const anomaly = durAnomaly(job);
          const bg = rowBg(job);
          return (
            <Tr
              key={job.id}
              isClickable
              onRowClick={() => onSelectJob(job)}
              style={bg ? { background: bg } : undefined}
            >
              {/* Star */}
              <Td
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatch(job.id);
                }}
              >
                <Button
                  variant="plain"
                  aria-label={isWatched ? "Unstar" : "Star"}
                  icon={
                    isWatched ? (
                      <StarIcon
                        style={{
                          color:
                            "var(--pf-t--global--icon--color--status--warning--default)",
                        }}
                      />
                    ) : (
                      <OutlinedStarIcon
                        style={{
                          color: "var(--pf-t--global--text--color--subtle)",
                        }}
                      />
                    )
                  }
                />
              </Td>

              {/* Job name + labels */}
              <Td dataLabel="Job">
                <div
                  style={{
                    fontWeight: "var(--pf-t--global--font--weight--body--bold)",
                    marginBottom: 3,
                  }}
                >
                  {job.name}
                </div>
                <LabelGroup numLabels={5}>
                  <JobFamilyLabels job={job} />
                  {job.requiredForRelease && (
                    <Label isCompact color="orange">
                      Release gate
                    </Label>
                  )}
                </LabelGroup>
              </Td>

              {/* Status + time + duration */}
              <Td dataLabel="Latest Run Status">
                <StatusLabel
                  outcome={statusOutcomeForJob(job)}
                  flakeCount={
                    statusOutcomeForJob(job) === "success" ? job.latestTestFlakes : undefined
                  }
                />
                {(job.latestOutcome === "running" || job.latestOutcome === "pending") &&
                  job.latestTerminalOutcome && (
                    <div style={{ marginTop: 2 }}>
                      <Tooltip content="Most recent finished run (while a newer build is still in progress)">
                        <span style={{ fontSize: "var(--pf-t--global--font--size--xs)" }}>
                          Prev: <StatusLabel outcome={job.latestTerminalOutcome} />
                        </span>
                      </Tooltip>
                    </div>
                  )}
                <div
                  style={{
                    fontSize: "var(--pf-t--global--font--size--sm)",
                    marginTop: 4,
                    color: "var(--pf-t--global--text--color--subtle)",
                  }}
                  title={job.latestRunAt ?? undefined}
                >
                  {formatRelative(job.latestRunAt)}
                  {job.latestDurationMinutes != null && (
                    <Tooltip content={anomaly ?? `Latest run: ${job.latestDurationMinutes}m`}>
                      <span style={{ cursor: anomaly ? "help" : "default" }}>
                        {" · "}
                        {anomaly ? (
                          <span
                            style={{
                              color:
                                "var(--pf-t--global--color--status--warning--default)",
                              fontWeight: 600,
                            }}
                          >
                            {job.latestDurationMinutes}m ⏱
                          </span>
                        ) : (
                          `${job.latestDurationMinutes}m`
                        )}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </Td>

              {/* Last green + SLA */}
              <Td dataLabel="Last green">
                <Tooltip
                  content={
                    job.lastSuccessAt
                      ? `${new Date(job.lastSuccessAt).toLocaleString()}${
                          job.lastSuccessSource === "sippy"
                            ? " · from Sippy last_pass (not in loaded sparkline)"
                            : " · from loaded run history"
                        }`
                      : job.dataProvenance === "none"
                        ? "No live data yet"
                        : "No successful run found in Sippy last_pass or loaded history"
                  }
                >
                  <div style={{ cursor: "help" }}>
                    {job.lastSuccessAt ? formatRelative(job.lastSuccessAt) : "—"}
                    {job.lastSuccessSource === "sippy" && (
                      <span
                        style={{
                          marginLeft: 4,
                          fontSize: "var(--pf-t--global--font--size--xs)",
                          color: "var(--pf-t--global--text--color--subtle)",
                        }}
                      >
                        (Sippy)
                      </span>
                    )}
                  </div>
                </Tooltip>
                <div style={{ marginTop: 3 }}>
                  <SlaBadge job={job} />
                </div>
              </Td>

              {/* Streak */}
              <Td dataLabel="Streak" className="ibmz-col-streak">
                <ConsecutiveBadge job={job} />
              </Td>

              {/* Pass rates */}
              <Td dataLabel="Pass rate">
                <PassRatePair
                  passRate7d={job.passRate7d}
                  passRate30d={job.passRate30d}
                  runs7d={job.runs7d}
                  passes7d={job.passes7d}
                  runs30d={job.runs30d}
                  passes30d={job.passes30d}
                  showLastN={showLastN}
                  passRateLastN={job.passRateLastN}
                  lastN={job.lastN}
                  passesLastN={job.passesLastN}
                  windowComplete7d={job.windowComplete7d}
                  windowComplete30d={job.windowComplete30d}
                />
              </Td>

              {/* Sparkline */}
              <Td dataLabel="Runs" onClick={(e) => e.stopPropagation()}>
                {job.history.length ? (
                  <RunSparkline
                    history={applyHistoryWindow(job.history, historyWindow)}
                    totalFetched={job.historyFetchedCount}
                    showAxis
                  />
                ) : (
                  <Tooltip content={job.liveError || "No completed runs returned from Sippy/Prow"}>
                    <span
                      style={{
                        color: "var(--pf-t--global--text--color--subtle)",
                        cursor: "help",
                      }}
                    >
                      {job.dataProvenance === "partial" ? "Sippy stats only" : "No runs"}
                    </span>
                  </Tooltip>
                )}
              </Td>

              {/* Links */}
              <Td dataLabel="Links" className="ibmz-col-links" onClick={(e) => e.stopPropagation()}>
                <Flex direction={{ default: "column" }} gap={{ default: "gapXs" }}>
                  <a href={job.links.prowHistory} target="_blank" rel="noreferrer">
                    Prow <ExternalLinkAltIcon />
                  </a>
                  <a href={job.links.sippy} target="_blank" rel="noreferrer">
                    Sippy <ExternalLinkAltIcon />
                  </a>
                  <a href={job.links.config} target="_blank" rel="noreferrer">
                    Config <ExternalLinkAltIcon />
                  </a>
                </Flex>
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
      </div>
    </div>
  );
}
