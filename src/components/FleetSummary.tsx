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
  const otherTerminal = activeJobs.filter((j) => {
    const t = j.latestTerminalOutcome;
    if (t == null) return false;
    return t !== "success" && t !== "failure";
  }).length;
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
              Scope: non-EOS OCP versions only (
              <TermHint meaning="Older OCP versions that are out of support are hidden here.">
                EOS excluded
              </TermHint>
              ) · data from{" "}
              <TermHint meaning="Sippy gives job health and pass/fail trends.">Sippy</TermHint>{" "}
              + <TermHint meaning="Prow gives individual run details and logs.">Prow</TermHint> · last
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
            meaning="Total IBM Z jobs shown for non-EOS OCP versions."
            variant="accent"
          />
          <Stat
            value={`${withLiveRuns}/${activeJobs.length}`}
            label="Have run history"
            meaning="Jobs where we got at least one finished run."
            variant="teal"
          />
          <Stat
            value={partial}
            label="Sippy stats only"
            meaning="Sippy has summary data, but run-by-run history has not loaded yet."
            variant="info"
          />
          <Stat
            value={passing}
            label="Last finished = pass"
            meaning="Latest finished run passed."
            variant="success"
          />
          <Stat
            value={failing}
            label="Last finished = fail"
            meaning="Latest finished run failed. Click to open those jobs."
            variant={failing > 0 ? "danger" : "default"}
            onClick={failing > 0 ? onShowFailing : undefined}
          />
          <Stat
            value={otherTerminal}
            label="Other terminal"
            meaning="Latest finished run is neither pass nor fail (for example upgrade issue or aborted). This is why Last pass + Last fail may be lower than Have run history."
            variant="default"
          />
          <Stat
            value={flaking}
            label="Streak flaking"
            meaning={`Latest run passed, but pass rate is ≤${STREAK_FLAKE_PASS_RATE_THRESHOLD}% in the last 7 or 30 days.`}
            variant="warning"
          />
          <Stat
            value={running}
            label="Running now"
            meaning="Latest run is still running or waiting to start."
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
            meaning="A required gate job is failing, never passed, or has 3+ failures in a row."
            variant={readiness.blocked > 0 ? "danger" : "default"}
          />
          <Stat
            value={readiness["at-risk"]}
            label="OCP versions at risk"
            meaning="A gate job is flaky, recently failed, or has not passed in 7+ days."
            variant={readiness["at-risk"] > 0 ? "warning" : "default"}
          />
          <Stat
            value={readiness.ready}
            label="OCP versions ready"
            meaning="Required gate jobs look healthy for this OCP version."
            variant={readiness.ready > 0 ? "success" : "default"}
          />
          {incomplete30 > 0 && (
            <Stat
              value={incomplete30}
              label="Partial 30d samples"
              meaning="These pass rates may be incomplete for the full 30-day window (shown with ~)."
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
          <TermHint meaning="Uses each job's latest finished run.">
            last run
          </TermHint>
          {" · "}
          <TermHint meaning="Shows Passed/Total % for runs in the last 7 or 30 days.">
            pass rate
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version is blocked when a required gate job is failing, never passed, or has 3+ failures in a row.">
            blocked
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version is at risk when a gate job is flaky, recently failed, or has not passed for 7+ days.">
            at risk
          </TermHint>
          {" · "}
          <TermHint meaning="An OCP version is ready when required gate jobs are healthy.">
            ready
          </TermHint>
          {" · "}
          <TermHint meaning="Gate jobs are the required checks used for release health (usually e2e, serial, and upgrade).">
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
            <div className="ibmz-section-label">Fleet pass rate (Passed/Total)</div>
            <Flex direction={{ default: "column" }} gap={{ default: "gapMd" }}>
              <PassRateMeter
                label="Last 7 days"
                passRate={pass7.passRate}
                passes={pass7.passes}
                total={pass7.total}
                complete={incomplete7 === 0}
                hint="Passed runs out of total counted runs in the last 7 days across non-EOS OCP versions (aborted excluded)"
              />
              <PassRateMeter
                label="Last 30 days"
                passRate={pass30.passRate}
                passes={pass30.passes}
                total={pass30.total}
                complete={incomplete30 === 0}
                hint="Passed runs out of total counted runs in the last 30 days across non-EOS OCP versions (aborted excluded)"
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
                tip="*-x-xz, *-z-xz, and *-z-za"
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
              "Homogeneous 30d (Passed/Total)",
              "Heterogeneous 30d (Passed/Total)",
              "Upgrade 30d (Passed/Total)",
              "7d (Passed/Total)",
              "30d (Passed/Total)",
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
                <td className="ibmz-detail-cell-version">
                  <Button variant="link" isInline onClick={() => onShowVersion(v.version)}>
                    {v.version}
                  </Button>
                </td>
                <td className="ibmz-detail-cell-status">
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
        columns and 7d/30d columns show Passed/Total %. Heterogeneous = *-x-xz / *-z-xz / *-z-za.
      </div>
    </div>
  );
}
