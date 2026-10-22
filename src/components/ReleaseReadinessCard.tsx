import { Card, CardBody, CardTitle, Label, Tooltip } from "@patternfly/react-core";
import type { VersionSummary } from "../types";
import { computeReadiness, weightedPassRate } from "../utils/stats";

interface ReleaseReadinessCardProps {
  versions: VersionSummary[];
}

const SIGNAL_META = {
  ready: {
    label: "Ready",
    color: "green" as const,
    bg: "var(--ibmz-success-strong)",
  },
  "at-risk": {
    label: "At risk",
    color: "orange" as const,
    bg: "var(--ibmz-warning-strong)",
  },
  blocked: {
    label: "Blocked",
    color: "red" as const,
    bg: "var(--ibmz-danger-strong)",
  },
  "no-data": {
    label: "No data",
    color: "grey" as const,
    bg: "var(--ibmz-muted-light)",
  },
};

export function ReleaseReadinessCard({ versions }: ReleaseReadinessCardProps) {
  if (!versions.length) return null;

  return (
    <Card isCompact className="ibmz-panel-card">
      <CardTitle className="ibmz-panel-title ibmz-panel-heading" style={{ padding: "1rem 1.25rem" }}>
        Release readiness (gate jobs)
      </CardTitle>
      <CardBody>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {versions.map((v) => {
            const signal = computeReadiness(v);
            const meta = SIGNAL_META[signal];
            const required = v.jobs.filter((j) => j.requiredForRelease);
            const rate = weightedPassRate(required, "30d");
            const tip = `OCP ${v.version} · ${required.length} gate jobs · 30d ${rate.passRate == null ? "—" : `${rate.passRate}% (${rate.passes}/${rate.total})`}`;

            return (
              <Tooltip key={v.version} content={tip}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    cursor: "help",
                  }}
                >
                  <div
                    style={{
                      padding: "2px 10px",
                      borderRadius: 4,
                      background: meta.bg,
                      color: "var(--pf-t--global--text--color--inverse)",
                      fontWeight: 700,
                      fontSize: "var(--pf-t--global--font--size--sm)",
                    }}
                  >
                    {v.version}
                  </div>
                  <Label color={meta.color} isCompact>
                    {meta.label}
                  </Label>
                </div>
              </Tooltip>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: "var(--pf-t--global--font--size--xs)",
            color: "var(--pf-t--global--text--color--subtle)",
          }}
        >
          Blocked = a gate job is failing, never passed, or has 3+ failures in a row. At risk =
          flaky or no pass in over 7 days.
        </div>
      </CardBody>
    </Card>
  );
}
