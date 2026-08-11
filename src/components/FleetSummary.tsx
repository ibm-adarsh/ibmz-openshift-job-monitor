import type { ReactNode, Ref } from "react";
import {
  Button,
  Card,
  CardBody,
  Divider,
  ExpandableSection,
  Flex,
  FlexItem,
  Label,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Title,
  Tooltip,
} from "@patternfly/react-core";
import { DownloadIcon, ExternalLinkAltIcon, SyncAltIcon } from "@patternfly/react-icons";
import { useMemo, useState } from "react";
import type { VersionSummary, ZJob } from "../types";
import { PassRateMeter } from "./PassRatePair";
import { TermHint } from "./TermHint";
import {
  categoryCounts,
  computeReadiness,
  fleetHeadline,
  isStreakFlaking,
  STREAK_FLAKE_PASS_RATE_THRESHOLD,
  terminalOutcome,
  weightedPassRate,
  type ReadinessSignal,
} from "../utils/stats";
import { isEosVersion } from "../data/inventory";

interface FleetSummaryProps {
  jobs: ZJob[];
  versions: VersionSummary[];
  refreshedAt: Date;
  onRefresh: () => void;
  autoRefreshSecs: number;
  onAutoRefreshChange: (secs: number) => void;
  onShowFailing: () => void;
  onShowCategory: (category: "homogeneous" | "heterogeneous" | "upgrade") => void;
  onShowVersion: (version: string) => void;
  details: ReactNode;
}

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
];

const SIGNAL_COLOR: Record<ReadinessSignal, "green" | "orange" | "red" | "grey"> = {
  ready: "green",
  "at-risk": "orange",
  blocked: "red",
  "no-data": "grey",
};

const SIGNAL_LABEL: Record<ReadinessSignal, string> = {
  ready: "Ready",
  "at-risk": "At risk",
  blocked: "Blocked",
  "no-data": "No data",
};

const HEADLINE_CLASS = {
  success: "ibmz-fleet-headline--success",
  warning: "ibmz-fleet-headline--warning",
  danger: "ibmz-fleet-headline--danger",
  unknown: "ibmz-fleet-headline--unknown",
} as const;

type StatVariant =
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "violet"
  | "teal"
  | "default";

function Stat({
  value,
  label,
  meaning,
  variant = "default",
  onClick,
}: {
  value: string | number;
  label: string;
  meaning: string;
  variant?: StatVariant;
  onClick?: () => void;
}) {
  const toneClass = variant === "default" ? "" : `ibmz-stat-card--${variant}`;
  return (
    <Tooltip content={meaning}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`ibmz-stat-card ${toneClass}${onClick ? " ibmz-stat-card--clickable" : ""}`}
      >
        <div className="ibmz-stat-value">{value}</div>
        <div className="ibmz-stat-label">{label}</div>
      </button>
    </Tooltip>
  );
}

function exportCsv(jobs: ZJob[]) {
  const headers = [
    "OCP Version",
    "Job Name",
    "Category",
    "Job Type",
    "Last finished outcome",
    "Pass Rate 7d %",
    "Runs 7d",
    "Passes 7d",
    "Pass Rate 30d %",
    "Runs 30d",
    "Passes 30d",
    "Prow History URL",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = jobs.map((j) =>
    [
      j.ocpVersion,
      j.name,
      j.category,
      j.jobType,
      terminalOutcome(j),
      j.passRate7d ?? "",
      j.runs7d ?? "",
      j.passes7d ?? "",
      j.passRate30d ?? "",
      j.runs30d ?? "",
      j.passes30d ?? "",
      j.links.prowHistory,
    ]
      .map(esc)
      .join(","),
  );
  const blob = new Blob([[headers.map(esc).join(","), ...rows].join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ibmz-openshift-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Concise fleet overview; expand for matrices and per-version detail. */
export function FleetSummary({
  jobs,
  versions,
  refreshedAt,
  onRefresh,
  autoRefreshSecs,
  onAutoRefreshChange,
  onShowFailing,
  onShowCategory,
  onShowVersion,
  details,
}: FleetSummaryProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const refreshLabel =
    REFRESH_OPTIONS.find((o) => o.value === autoRefreshSecs)?.label ?? "Off";

  const activeJobs = useMemo(
    () => jobs.filter((j) => !isEosVersion(j.ocpVersion)),
    [jobs],
  );
  const activeVersions = useMemo(
    () => versions.filter((v) => !v.eos),
    [versions],
  );

  const headline = useMemo(() => fleetHeadline(versions), [versions]);
  const cats = useMemo(() => categoryCounts(activeJobs), [activeJobs]);
  const pass7 = useMemo(() => weightedPassRate(activeJobs, "7d"), [activeJobs]);
  const pass30 = useMemo(() => weightedPassRate(activeJobs, "30d"), [activeJobs]);

  const failing = activeJobs.filter((j) => j.latestTerminalOutcome === "failure").length;
  const flaking = activeJobs.filter((j) => isStreakFlaking(j)).length;
  const passing = activeJobs.filter((j) => j.latestTerminalOutcome === "success").length;
  const noData = activeJobs.filter((j) => j.dataProvenance === "none").length;
  const partial = activeJobs.filter((j) => j.dataProvenance === "partial").length;
  const withLiveRuns = activeJobs.filter((j) => j.dataProvenance === "live").length;
  const running = activeJobs.filter(
    (j) => j.latestOutcome === "running" || j.latestOutcome === "pending",
  ).length;
  const incomplete7 = activeJobs.filter(
    (j) => j.dataProvenance === "live" && !j.windowComplete7d && (j.runs7d ?? 0) > 0,
  ).length;
  const incomplete30 = activeJobs.filter(
    (j) => j.dataProvenance === "live" && !j.windowComplete30d && (j.runs30d ?? 0) > 0,
  ).length;

  const readiness = useMemo(() => {
    const map = { ready: 0, "at-risk": 0, blocked: 0, "no-data": 0 };
    for (const v of activeVersions) map[computeReadiness(v)] += 1;
    return map;
  }, [activeVersions]);

  return (
    <Card className="ibmz-panel-card ibmz-fleet-card">
      <CardBody>
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsFlexStart" }}
          flexWrap={{ default: "wrap" }}
          gap={{ default: "gapMd" }}
        >
          <FlexItem>
            <Title headingLevel="h2" size="lg" style={{ marginBottom: 4 }}>
              Fleet overview
            </Title>
            <div className={`ibmz-fleet-headline ${HEADLINE_CLASS[headline.tone]}`}>
              {headline.text}
            </div>
            <div
              style={{
                marginTop: 6,
                color: "var(--pf-t--global--text--color--subtle)",
                fontSize: "var(--pf-t--global--font--size--sm)",
                maxWidth: 720,
                lineHeight: 1.45,
              }}
            >
              {headline.detail}
            </div>
            <div
              style={{
                marginTop: 6,
                color: "var(--pf-t--global--text--color--subtle)",
                fontSize: "var(--pf-t--global--font--size--xs)",
              }}
            >
              Scope: supported OCP versions only (
              <TermHint meaning="End-of-support OCP versions are excluded so the overview focuses on versions still shipping.">
                EOS excluded
              </TermHint>
              ) · data from{" "}
              <TermHint meaning="Sippy tracks pass-rate trends across OpenShift CI.">Sippy</TermHint>{" "}
              + <TermHint meaning="Prow stores individual job runs and logs.">Prow</TermHint> · last
              refreshed {refreshedAt.toLocaleString()}
              {" · "}
              <span style={{ fontStyle: "italic" }}>hover dotted terms for definitions</span>
            </div>
          </FlexItem>
          <FlexItem>
            <Flex gap={{ default: "gapSm" }} alignItems={{ default: "alignItemsCenter" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={onShowFailing}
                isDisabled={failing === 0}
              >
                View failing jobs
              </Button>
              <Button variant="link" size="sm" icon={<DownloadIcon />} onClick={() => exportCsv(activeJobs)}>
                CSV
              </Button>
              <Button variant="link" size="sm" icon={<SyncAltIcon />} onClick={onRefresh}>
                Refresh
              </Button>
              <Select
                id="fleet-auto-refresh"
                isOpen={refreshOpen}
                selected={autoRefreshSecs}
                onSelect={(_e, value) => {
                  onAutoRefreshChange(Number(value));
                  setRefreshOpen(false);
                }}
                onOpenChange={setRefreshOpen}
                toggle={(ref: Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={ref}
                    onClick={() => setRefreshOpen(!refreshOpen)}
                    isExpanded={refreshOpen}
                    style={{ width: 110, fontSize: "var(--pf-t--global--font--size--sm)" }}
                  >
                    Auto: {refreshLabel}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  {REFRESH_OPTIONS.map((o) => (
                    <SelectOption key={o.value} value={o.value}>
                      {o.label}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </Flex>
          </FlexItem>
        </Flex>

        <div className="ibmz-stat-grid">
          <Stat
            value={activeJobs.length}
            label="IBM Z jobs"
            meaning="Periodic CI jobs for supported (non-EOS) OCP versions in this inventory."
            variant="accent"
          />
          <Stat
            value={`${withLiveRuns}/${activeJobs.length}`}
            label="Have run history"
            meaning="Jobs where Sippy/Prow returned at least one completed run."
            variant="teal"
          />
          <Stat
            value={partial}
            label="Sippy stats only"
            meaning="Sippy knows the job but no individual run rows were returned yet."
            variant="info"
          />
          <Stat
            value={passing}
            label="Last finished = pass"
            meaning="Most recent finished (non-running) run was success."
            variant="success"
          />
          <Stat
            value={failing}
            label="Last finished = fail"
            meaning="Most recent finished run was a failure. Click to open those jobs."
            variant={failing > 0 ? "danger" : "default"}
            onClick={failing > 0 ? onShowFailing : undefined}
          />
          <Stat
            value={flaking}
            label="Streak flaking"
            meaning={`Last finished run passed but pass rate is ≤${STREAK_FLAKE_PASS_RATE_THRESHOLD}% in the last 7 or 30 days.`}
            variant="warning"
          />
          <Stat
            value={running}
            label="Running now"
            meaning="Newest build is still running or pending."
            variant="info"
          />
          <Stat
            value={noData}
            label="No CI data"
            meaning="Neither Sippy nor Prow returned data for this job."
          />
          <Stat
            value={readiness.blocked}
            label="OCP versions blocked"
            meaning="A required gate job is failing, never passed (per Sippy), or has 3+ fails in a row."
            variant={readiness.blocked > 0 ? "danger" : "default"}
          />
          <Stat
            value={readiness["at-risk"]}
            label="OCP versions at risk"
            meaning="Gate job is flaking, had a recent fail, or no green run in 7+ days."
            variant={readiness["at-risk"] > 0 ? "warning" : "default"}
          />
          <Stat
            value={readiness.ready}
            label="OCP versions ready"
            meaning="Required gate jobs look healthy for that OCP version."
            variant={readiness.ready > 0 ? "success" : "default"}
          />
          {incomplete30 > 0 && (
            <Stat
              value={incomplete30}
              label="Partial 30d samples"
              meaning="These jobs have pass% based on loaded runs that may not fully cover 30 calendar days (shown with ~)."
              variant="violet"
            />
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: "var(--pf-t--global--font--size--sm)",
            color: "var(--pf-t--global--text--color--subtle)",
          }}
        >
          Key terms:{" "}
          <TermHint meaning="Counts based on each job’s most recent finished run — a snapshot of what is broken right now.">
            last run
          </TermHint>
          {" · "}
          <TermHint meaning="Successful finished runs ÷ all finished runs in the last 7 or 30 days (run-weighted trend).">
            pass rate
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version where a required release-gate job is failing, never passed, or has 3+ fails in a row.">
            blocked
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version where a gate job is flaking, had a recent fail, or has not been green for 7+ days.">
            at risk
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version whose required gate jobs (e2e, serial, upgrade) look healthy.">
            ready
          </TermHint>
          {" · "}
          <TermHint meaning="Required jobs used to judge whether a release version is healthy (typically e2e, serial, upgrade).">
            gate jobs
          </TermHint>
        </div>

        <Divider style={{ margin: "20px 0" }} />

        <Flex
          gap={{ default: "gap2xl" }}
          flexWrap={{ default: "wrap" }}
          alignItems={{ default: "alignItemsFlexStart" }}
        >
          <div style={{ minWidth: 200, flex: "1 1 220px" }}>
            <div className="ibmz-section-label">Fleet pass rate (run-weighted)</div>
            <Flex direction={{ default: "column" }} gap={{ default: "gapMd" }}>
              <PassRateMeter
                label="Last 7 days"
                passRate={pass7.passRate}
                passes={pass7.passes}
                total={pass7.total}
                complete={incomplete7 === 0}
                hint="Successful scored runs ÷ scored runs in the last 7 days across non-EOS jobs (aborted excluded)"
              />
              <PassRateMeter
                label="Last 30 days"
                passRate={pass30.passRate}
                passes={pass30.passes}
                total={pass30.total}
                complete={incomplete30 === 0}
                hint="Successful scored runs ÷ scored runs in the last 30 days across non-EOS jobs (aborted excluded)"
              />
            </Flex>
          </div>

          <div style={{ minWidth: 200, flex: "1 1 220px" }}>
            <div className="ibmz-section-label">Job family</div>
            <Flex direction={{ default: "column" }} gap={{ default: "gapSm" }}>
              <FamilyRow
                label="Homogeneous"
                count={cats.homogeneous}
                tip="Single-arch Z (s390x, multi-z-z, VPN, …)"
                onClick={() => onShowCategory("homogeneous")}
                family="homo"
              />
              <FamilyRow
                label="Heterogeneous"
                count={cats.heterogeneous}
                tip="Only *-x-xz and *-z-xz"
                onClick={() => onShowCategory("heterogeneous")}
                family="hetero"
              />
              <FamilyRow
                label="Upgrade"
                count={cats.upgrade}
                tip="n→n+1 upgrade periodics"
                onClick={() => onShowCategory("upgrade")}
                family="upgrade"
              />
            </Flex>
          </div>

          <div style={{ minWidth: 260, flex: "2 1 280px" }}>
            <div className="ibmz-section-label">Versions (click to open Jobs)</div>
            <Flex gap={{ default: "gapSm" }} flexWrap={{ default: "wrap" }}>
              {activeVersions.map((v) => {
                const signal = computeReadiness(v);
                const rate = weightedPassRate(v.jobs, "30d");
                return (
                  <Tooltip
                    key={v.version}
                    content={`${SIGNAL_LABEL[signal]} · 30d ${rate.passRate == null ? "—" : `${rate.passRate}% (${rate.passes}/${rate.total})`} · ${v.jobs.length} jobs`}
                  >
                    <Button
                      variant="control"
                      size="sm"
                      onClick={() => onShowVersion(v.version)}
                      className="ibmz-version-chip"
                      style={{ paddingInline: 8 }}
                    >
                      <Flex
                        alignItems={{ default: "alignItemsCenter" }}
                        gap={{ default: "gapXs" }}
                      >
                        <strong>{v.version}</strong>
                        <Label color={SIGNAL_COLOR[signal]} isCompact>
                          {SIGNAL_LABEL[signal]}
                        </Label>
                        <span
                          style={{
                            fontSize: "var(--pf-t--global--font--size--xs)",
                            color: "var(--pf-t--global--text--color--subtle)",
                          }}
                        >
                          {rate.passRate == null ? "—" : `${Math.round(rate.passRate)}%`}
                        </span>
                      </Flex>
                    </Button>
                  </Tooltip>
                );
              })}
            </Flex>
          </div>
        </Flex>

        <ExpandableSection
          toggleText={showDetails ? "Hide details" : "More details"}
          isExpanded={showDetails}
          onToggle={(_e, expanded) => setShowDetails(expanded)}
          style={{ marginTop: 20 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <VersionDetailTable
              versions={activeVersions}
              onShowVersion={onShowVersion}
            />
            {details}
          </div>
        </ExpandableSection>
      </CardBody>
    </Card>
  );
}

function FamilyRow({
  label,
  count,
  tip,
  onClick,
  family,
}: {
  label: string;
  count: number;
  tip: string;
  onClick: () => void;
  family: "homo" | "hetero" | "upgrade";
}) {
  return (
    <Tooltip content={`${tip} · click to filter Jobs`}>
      <button
        type="button"
        onClick={onClick}
        className={`ibmz-family-row ibmz-family-row--${family}`}
      >
        <span>{label}</span>
        <strong>
          {count} <ExternalLinkAltIcon style={{ marginLeft: 4, fontSize: 10 }} />
        </strong>
      </button>
    </Tooltip>
  );
}

function VersionDetailTable({
  versions,
  onShowVersion,
}: {
  versions: VersionSummary[];
  onShowVersion: (version: string) => void;
}) {
  return (
    <div className="ibmz-detail-table-wrap">
      <Title headingLevel="h3" size="md" style={{ marginBottom: 8 }}>
        Per-version breakdown
      </Title>
      <table className="ibmz-detail-table" aria-label="Per-version job and pass rate breakdown">
        <thead>
          <tr>
            {[
              "Version",
              "Status",
              "Jobs",
              "Last pass",
              "Last fail",
              "Homo 30d",
              "Hetero 30d",
              "Upgrade 30d",
              "7d pass",
              "30d pass",
            ].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const signal = computeReadiness(v);
            const homo = v.jobs.filter((j) => j.category === "homogeneous");
            const hetero = v.jobs.filter((j) => j.category === "heterogeneous");
            const upgrade = v.jobs.filter((j) => j.category === "upgrade");
            const r7 = weightedPassRate(v.jobs, "7d");
            const r30 = weightedPassRate(v.jobs, "30d");
            const fmt = (r: ReturnType<typeof weightedPassRate>) =>
              r.passRate == null ? "—" : `${r.passRate}% (${r.passes}/${r.total})`;
            return (
              <tr key={v.version}>
                <td>
                  <Button variant="link" isInline onClick={() => onShowVersion(v.version)}>
                    {v.version}
                  </Button>
                </td>
                <td>
                  <Label color={SIGNAL_COLOR[signal]} isCompact>
                    {SIGNAL_LABEL[signal]}
                  </Label>
                </td>
                <td className="ibmz-detail-num">{v.jobs.length}</td>
                <td className="ibmz-detail-num">{v.passing}</td>
                <td className="ibmz-detail-num">{v.failing}</td>
                <td className="ibmz-detail-num">{fmt(weightedPassRate(homo, "30d"))}</td>
                <td className="ibmz-detail-num">{fmt(weightedPassRate(hetero, "30d"))}</td>
                <td className="ibmz-detail-num">{fmt(weightedPassRate(upgrade, "30d"))}</td>
                <td className="ibmz-detail-num">{fmt(r7)}</td>
                <td className="ibmz-detail-num">{fmt(r30)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ibmz-detail-table-footnote">
        Last pass / Last fail = jobs whose most recent finished run passed or failed. Category
        columns are 30-day run-weighted pass rates. Heterogeneous = *-x-xz / *-z-xz only.
      </div>
    </div>
  );
}
