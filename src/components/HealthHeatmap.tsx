import {
  Card,
  CardBody,
  CardTitle,
  Content,
  Flex,
  FlexItem,
  Tooltip,
} from "@patternfly/react-core";
import { InfoCircleIcon } from "@patternfly/react-icons";
import type { VersionSummary, JobType } from "../types";
import { weightedPassRate } from "../utils/stats";

const TYPES: JobType[] = [
  "e2e",
  "serial",
  "fips",
  "image-ecosystem",
  "upgrade",
  "agent",
  "techpreview",
];

const TYPE_LABEL: Record<JobType, string> = {
  e2e: "E2E",
  serial: "Serial",
  fips: "FIPS",
  "image-ecosystem": "Image ecosystem",
  upgrade: "Upgrade",
  agent: "Agent",
  techpreview: "Tech preview",
};

const TYPE_TIP: Record<JobType, string> = {
  e2e: "End-to-end OpenShift tests on Z",
  serial: "Serial (non-parallel) e2e — often a release gate",
  fips: "FIPS-enabled cluster tests",
  "image-ecosystem": "Image / workload ecosystem tests",
  upgrade: "Version upgrade tests (also shown in upgrade path below)",
  agent: "Agent-based install tests",
  techpreview: "Tech-preview feature tests",
};

function cellTone(passRate: number | null, hasRuns: boolean): "good" | "mid" | "low" | "empty" {
  if (!hasRuns || passRate == null) return "empty";
  if (passRate >= 85) return "good";
  if (passRate >= 60) return "mid";
  return "low";
}

interface HealthHeatmapProps {
  versions: VersionSummary[];
  onFilterByVersionType?: (version: string, jobType: JobType) => void;
}

export function HealthHeatmap({ versions, onFilterByVersionType }: HealthHeatmapProps) {
  const active = versions.filter((v) => !v.eos);

  return (
    <Card className="ibmz-panel-card ibmz-heatmap-card">
      <CardTitle className="ibmz-panel-title">
        <Flex
          direction={{ default: "column" }}
          gap={{ default: "gapSm" }}
          style={{ width: "100%" }}
        >
          <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
            <FlexItem>
              <span className="ibmz-panel-heading">How healthy is each job family?</span>
            </FlexItem>
            <FlexItem>
              <Tooltip
                content={
                  "Each tile shows 30-day Passed/Total % for one job type on one OCP version. " +
                  "Total includes success, fail, flake, and upgrade runs (aborted excluded). " +
                  (onFilterByVersionType ? "Click a tile to open those jobs." : "")
                }
              >
                <InfoCircleIcon className="ibmz-panel-info-icon" aria-label="About this matrix" />
              </Tooltip>
            </FlexItem>
          </Flex>
          <Content component="p" className="ibmz-panel-subtitle">
            30-day Passed/Total % by job type and OCP version (non-EOS only). Darker green =
            healthier; red = needs attention.
          </Content>
          <Flex gap={{ default: "gapMd" }} flexWrap={{ default: "wrap" }} className="ibmz-legend-row">
            <LegendItem tone="good" label="Healthy — 85% or higher" />
            <LegendItem tone="mid" label="Watch — 60% to 84%" />
            <LegendItem tone="low" label="At risk — below 60%" />
            <LegendItem tone="empty" label="No runs in 30 days" />
          </Flex>
        </Flex>
      </CardTitle>
      <CardBody className="ibmz-panel-body">
        <div className="ibmz-heatmap-scroll">
          <table className="ibmz-heatmap-table" aria-label="30-day pass rate by job type and version">
            <thead>
              <tr>
                <th className="ibmz-heatmap-sticky-col ibmz-heatmap-corner" scope="col">
                  Job type
                </th>
                {active.map((v) => {
                  const r = weightedPassRate(v.jobs, "30d");
                  return (
                    <th key={v.version} className="ibmz-heatmap-version-head" scope="col">
                      <Tooltip
                        content={
                          r.passRate == null
                            ? `OCP ${v.version} — no counted runs in the last 30 days`
                            : `OCP ${v.version} overall — ${r.passes} of ${r.total} runs passed (${Math.round(r.passRate)}%)`
                        }
                      >
                        <div className="ibmz-version-pill">OCP {v.version}</div>
                      </Tooltip>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {TYPES.map((type) => (
                <tr key={type}>
                  <th scope="row" className="ibmz-heatmap-sticky-col ibmz-heatmap-type-label">
                    <Tooltip content={TYPE_TIP[type]}>
                      <span>{TYPE_LABEL[type]}</span>
                    </Tooltip>
                  </th>
                  {active.map((v) => {
                    const typeJobs = v.jobs.filter((j) => j.jobType === type);
                    const rate = weightedPassRate(typeJobs, "30d");
                    const hasRuns = rate.total > 0;
                    const hasJobs = typeJobs.length > 0;
                    const clickable = hasJobs && !!onFilterByVersionType;
                    const tone = cellTone(rate.passRate, hasRuns);
                    const tip = hasRuns
                      ? `${TYPE_LABEL[type]} on OCP ${v.version}: ${rate.passes} passed of ${rate.total} runs (${Math.round(rate.passRate ?? 0)}%) · ${typeJobs.length} job(s)`
                      : hasJobs
                        ? `${TYPE_LABEL[type]} on OCP ${v.version}: ${typeJobs.length} job(s) but no counted runs in 30 days`
                        : `No ${TYPE_LABEL[type]} jobs on OCP ${v.version}`;

                    return (
                      <td key={v.version} className="ibmz-heatmap-td">
                        <Tooltip content={tip + (clickable ? " · Click to view jobs" : "")}>
                          <button
                            type="button"
                            className={`ibmz-heatmap-tile ibmz-heatmap-tile--${tone}${clickable ? " ibmz-heatmap-tile--clickable" : ""}`}
                            disabled={!clickable}
                            onClick={
                              clickable
                                ? () => onFilterByVersionType!(v.version, type)
                                : undefined
                            }
                            aria-label={
                              hasRuns
                                ? `${TYPE_LABEL[type]} OCP ${v.version}: ${Math.round(rate.passRate ?? 0)}%`
                                : hasJobs
                                  ? `${TYPE_LABEL[type]} OCP ${v.version}: no runs`
                                  : `${TYPE_LABEL[type]} not defined on OCP ${v.version}`
                            }
                          >
                            {hasRuns ? (
                              <>
                                <span className="ibmz-heatmap-pct">
                                  {Math.round(rate.passRate ?? 0)}%
                                </span>
                                <span className="ibmz-heatmap-runs">
                                  {rate.passes}/{rate.total} runs
                                </span>
                              </>
                            ) : hasJobs ? (
                              <>
                                <span className="ibmz-heatmap-pct ibmz-heatmap-pct--muted">—</span>
                                <span className="ibmz-heatmap-runs">No runs</span>
                              </>
                            ) : (
                              <>
                                <span className="ibmz-heatmap-pct ibmz-heatmap-pct--muted">N/A</span>
                                <span className="ibmz-heatmap-runs">Not defined</span>
                              </>
                            )}
                          </button>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function LegendItem({ tone, label }: { tone: "good" | "mid" | "low" | "empty"; label: string }) {
  return (
    <span className="ibmz-legend-item">
      <span className={`ibmz-legend-swatch ibmz-legend-swatch--${tone}`} aria-hidden />
      <span className="ibmz-legend-text">{label}</span>
    </span>
  );
}
