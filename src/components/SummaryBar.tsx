import {
  Card,
  CardBody,
  Flex,
  FlexItem,
  Label,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  type MenuToggleElement,
  Divider,
} from "@patternfly/react-core";
import { DownloadIcon, SyncAltIcon } from "@patternfly/react-icons";
import { useMemo, useState, type Ref } from "react";
import type { ZJob } from "../types";
import { PassRateMeter } from "./PassRatePair";

interface SummaryBarProps {
  total: number;
  passing: number;
  failing: number;
  flaking: number;
  running: number;
  noData: number;
  aborted: number;
  versionsAtRisk: number;
  refreshedAt: Date;
  liveCount: number;
  onRefresh: () => void;
  /** All filtered jobs — used for CSV export */
  jobs: ZJob[];
  /** Auto-refresh interval in seconds; 0 = off */
  autoRefreshSecs: number;
  onAutoRefreshChange: (secs: number) => void;
}

function Metric({
  label,
  value,
  emphasis,
  onClick,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      title={onClick ? `Click to filter by ${label}` : undefined}
    >
      <div
        style={{
          fontSize: "var(--pf-t--global--font--size--2xl)",
          fontWeight: "var(--pf-t--global--font--weight--body--bold)",
          color: emphasis ? "var(--pf-t--global--color--status--danger--default)" : undefined,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "var(--pf-t--global--text--color--subtle)",
          fontSize: "var(--pf-t--global--font--size--sm)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function aggregatePassRate(
  jobs: ZJob[],
  passesKey: "passes7d" | "passes30d",
  runsKey: "runs7d" | "runs30d",
): { passRate: number | null; passes: number | null; total: number | null } {
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
  if (!total) return { passRate: null, passes: null, total: null };
  return {
    passRate: Math.round((passes / total) * 1000) / 10,
    passes,
    total,
  };
}

function exportCsv(jobs: ZJob[]) {
  const headers = [
    "OCP Version",
    "Job Name",
    "Job Type",
    "Category",
    "Latest Outcome",
    "Latest Run At",
    "Last Success At",
    "Days Since Last Success",
    "Consecutive Failures",
    "Never Passed",
    "Pass Rate 7d %",
    "Runs 7d",
    "Passes 7d",
    "Pass Rate 30d %",
    "Runs 30d",
    "Passes 30d",
    "Pass Rate Last N %",
    "Last N",
    "Flake Rate 30d %",
    "Sippy Current %",
    "Required For Release",
    "Data Provenance",
    "Config File",
    "Prow History URL",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = jobs.map((j) =>
    [
      j.ocpVersion,
      j.name,
      j.jobType,
      j.category,
      j.latestOutcome,
      j.latestRunAt ?? "",
      j.lastSuccessAt ?? "",
      j.daysSinceLastSuccess ?? "",
      j.consecutiveFailures,
      j.neverPassed,
      j.passRate7d ?? "",
      j.runs7d ?? "",
      j.passes7d ?? "",
      j.passRate30d ?? "",
      j.runs30d ?? "",
      j.passes30d ?? "",
      j.passRateLastN ?? "",
      j.lastN ?? "",
      j.flakeRate30d ?? "",
      j.sippyCurrentPassPct ?? "",
      j.requiredForRelease,
      j.dataProvenance,
      j.configFile,
      j.links.prowHistory,
    ]
      .map(esc)
      .join(","),
  );
  const csv = [headers.map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ibmz-openshift-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "30 min", value: 1800 },
];

export function SummaryBar({
  total,
  passing,
  failing,
  flaking,
  running,
  noData,
  aborted,
  versionsAtRisk,
  refreshedAt,
  liveCount,
  onRefresh,
  jobs,
  autoRefreshSecs,
  onAutoRefreshChange,
}: SummaryBarProps) {
  const [refreshOpen, setRefreshOpen] = useState(false);
  const currentRefreshLabel =
    REFRESH_OPTIONS.find((o) => o.value === autoRefreshSecs)?.label ?? "Off";
  const fleet7d = useMemo(() => aggregatePassRate(jobs, "passes7d", "runs7d"), [jobs]);
  const fleet30d = useMemo(() => aggregatePassRate(jobs, "passes30d", "runs30d"), [jobs]);

  return (
    <Card isCompact>
      <CardBody>
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsCenter" }}
          flexWrap={{ default: "wrap" }}
          gap={{ default: "gapLg" }}
        >
          <Flex
            gap={{ default: "gapXl" }}
            flexWrap={{ default: "wrap" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <Metric label="Total jobs" value={total} />
            <Metric label="Passing" value={passing} />
            <Metric label="Failing" value={failing} emphasis={failing > 0} />
            <Metric label="Flaking" value={flaking} />
            <Metric label="Running" value={running} />
            <Metric label="Aborted" value={aborted} />
            <Metric label="No live data" value={noData} />
            <Metric label="Versions at risk" value={versionsAtRisk} emphasis={versionsAtRisk > 0} />
            <Divider
              orientation={{ default: "vertical" }}
              style={{ alignSelf: "stretch", height: "auto", minHeight: 48 }}
            />
            <div style={{ minWidth: 130 }}>
              <div
                style={{
                  fontSize: "var(--pf-t--global--font--size--xs)",
                  color: "var(--pf-t--global--text--color--subtle)",
                  marginBottom: 6,
                  fontWeight: "var(--pf-t--global--font--weight--body--bold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                Fleet pass rate
              </div>
              <Flex direction={{ default: "column" }} gap={{ default: "gapSm" }}>
                <PassRateMeter
                  label="7 days"
                  passRate={fleet7d.passRate}
                  passes={fleet7d.passes}
                  total={fleet7d.total}
                  hint="Weighted pass rate across all filtered jobs in the last 7 days"
                />
                <PassRateMeter
                  label="30 days"
                  passRate={fleet30d.passRate}
                  passes={fleet30d.passes}
                  total={fleet30d.total}
                  hint="Weighted pass rate across all filtered jobs in the last 30 days"
                />
              </Flex>
            </div>
          </Flex>

          <FlexItem>
            <Flex direction={{ default: "column" }} gap={{ default: "gapSm" }}>
              <Flex gap={{ default: "gapSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <Label color="green" isCompact>
                  live Sippy + Prow
                </Label>
                <span
                  style={{
                    color: "var(--pf-t--global--text--color--subtle)",
                    fontSize: "var(--pf-t--global--font--size--sm)",
                  }}
                >
                  {liveCount}/{total} · {refreshedAt.toLocaleString()}
                </span>
              </Flex>

              <Flex gap={{ default: "gapSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <button
                  type="button"
                  onClick={onRefresh}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 4px",
                    color: "var(--pf-t--global--text--color--link--default)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "var(--pf-t--global--font--size--sm)",
                  }}
                >
                  <SyncAltIcon /> Refresh now
                </button>

                <Select
                  id="auto-refresh-select"
                  isOpen={refreshOpen}
                  selected={autoRefreshSecs}
                  onSelect={(_e, value) => {
                    onAutoRefreshChange(Number(value));
                    setRefreshOpen(false);
                  }}
                  onOpenChange={(isOpen) => setRefreshOpen(isOpen)}
                  toggle={(ref: Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={ref}
                      onClick={() => setRefreshOpen(!refreshOpen)}
                      isExpanded={refreshOpen}
                      style={{ width: 120, fontSize: "var(--pf-t--global--font--size--sm)" }}
                    >
                      Auto: {currentRefreshLabel}
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

                <button
                  type="button"
                  onClick={() => exportCsv(jobs)}
                  title={`Export ${jobs.length} filtered jobs to CSV`}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 4px",
                    color: "var(--pf-t--global--text--color--link--default)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "var(--pf-t--global--font--size--sm)",
                  }}
                >
                  <DownloadIcon /> Export CSV
                </button>
              </Flex>
            </Flex>
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  );
}
