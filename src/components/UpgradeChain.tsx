import {
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Flex,
  FlexItem,
  Label,
  Tooltip,
} from "@patternfly/react-core";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ExternalLinkAltIcon,
  InfoCircleIcon,
  TimesCircleIcon,
} from "@patternfly/react-icons";
import type { JobOutcome, VersionSummary, ZJob } from "../types";
import { weightedPassRate } from "../utils/stats";
import { formatRelative } from "../utils/format";
import { StatusLabel } from "./StatusLabel";

interface UpgradeChainProps {
  versions: VersionSummary[];
  onShowVersion?: (version: string) => void;
}

function upgradeOutcome(job: ZJob | undefined): JobOutcome | null {
  if (!job) return null;
  return job.latestTerminalOutcome ?? job.latestOutcome;
}

function streakLabel(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "1 fail since last green";
  if (n >= 10) return `${n} fails since last green`;
  return `${n} fails since last green`;
}

export function UpgradeChain({ versions, onShowVersion }: UpgradeChainProps) {
  const active = [...versions]
    .filter((v) => !v.eos)
    .sort((a, b) => {
      const [amaj, amin] = a.version.split(".").map(Number);
      const [bmaj, bmin] = b.version.split(".").map(Number);
      if (amaj !== bmaj) return amaj - bmaj;
      return amin - bmin;
    });

  if (active.length < 2) return null;

  const hops = active.slice(1).map((v, idx) => {
    const fallbackFrom = active[idx].version;
    const upgradeJob = v.jobs.find((j) => j.jobType === "upgrade");
    const from = upgradeJob?.upgradeFrom ?? fallbackFrom;
    const outcome = upgradeOutcome(upgradeJob);
    const pass = upgradeJob ? weightedPassRate([upgradeJob], "30d") : null;
    return { from, to: v.version, upgradeJob, outcome, pass };
  });

  const failing = hops.filter(
    (h) => h.outcome === "failure" || h.outcome === "upgrade" || h.outcome === "flaking",
  ).length;
  const passing = hops.filter((h) => h.outcome === "success").length;

  return (
    <Card className="ibmz-panel-card ibmz-upgrade-card">
      <CardTitle className="ibmz-panel-title">
        <Flex
          direction={{ default: "column" }}
          gap={{ default: "gapSm" }}
          style={{ width: "100%" }}
        >
          <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
            <FlexItem>
              <span className="ibmz-panel-heading">Are version upgrades passing?</span>
            </FlexItem>
            <FlexItem>
              <Tooltip
                content={
                  "Each row is the upgrade periodic that tests moving from one OCP version to the next. " +
                  "Status reflects the last finished run, not a run still in progress."
                }
              >
                <InfoCircleIcon className="ibmz-panel-info-icon" aria-label="About upgrade health" />
              </Tooltip>
            </FlexItem>
          </Flex>
          <Content component="p" className="ibmz-panel-subtitle">
            Upgrade source/target comes from each job's configured path (for example 4.22 → 5.0). Non-EOS versions only.
          </Content>
          <Flex gap={{ default: "gapSm" }} flexWrap={{ default: "wrap" }}>
            <Label color={failing > 0 ? "red" : "green"} isCompact icon={failing > 0 ? <TimesCircleIcon /> : <CheckCircleIcon />}>
              {failing} of {hops.length} steps need attention
            </Label>
            {passing > 0 && (
              <Label color="green" isCompact icon={<CheckCircleIcon />}>
                {passing} passing
              </Label>
            )}
            <Label color="blue" isCompact>
              Path: {active[0].version} → {active[active.length - 1].version}
            </Label>
          </Flex>
        </Flex>
      </CardTitle>
      <CardBody className="ibmz-panel-body">
        <div className="ibmz-upgrade-list">
          {hops.map((hop) => {
            const isOk = hop.outcome === "success";
            const isBad =
              hop.outcome === "failure" || hop.outcome === "upgrade" || hop.outcome === "flaking";
            const passPct =
              hop.pass?.passRate == null ? null : Math.round(hop.pass.passRate ?? 0);
            const jobShort = hop.upgradeJob?.name.replace(/^ocp-/, "") ?? "";

            return (
              <div
                key={hop.to}
                className={`ibmz-upgrade-hop${isBad ? " ibmz-upgrade-hop--bad" : isOk ? " ibmz-upgrade-hop--ok" : ""}`}
              >
                <div className="ibmz-upgrade-hop-path">
                  <span className="ibmz-upgrade-version">{hop.from}</span>
                  <ArrowRightIcon className="ibmz-upgrade-arrow" aria-hidden />
                  <span className="ibmz-upgrade-version ibmz-upgrade-version--target">{hop.to}</span>
                </div>

                <div className="ibmz-upgrade-hop-body">
                  {hop.upgradeJob ? (
                    <Tooltip content={hop.upgradeJob.name}>
                      <div className="ibmz-upgrade-job-name">{jobShort}</div>
                    </Tooltip>
                  ) : (
                    <div className="ibmz-upgrade-job-name ibmz-muted">No upgrade job defined</div>
                  )}

                  {hop.upgradeJob && hop.outcome ? (
                    <Flex
                      alignItems={{ default: "alignItemsCenter" }}
                      gap={{ default: "gapSm" }}
                      flexWrap={{ default: "wrap" }}
                      className="ibmz-upgrade-hop-meta"
                    >
                      <StatusLabel outcome={hop.outcome} />
                      {hop.upgradeJob.latestTerminalAt && (
                        <span className="ibmz-upgrade-time">
                          Last finished {formatRelative(hop.upgradeJob.latestTerminalAt)}
                        </span>
                      )}
                      {hop.upgradeJob.consecutiveFailures > 0 && (
                        <Label color={isBad ? "red" : "orange"} isCompact>
                          {streakLabel(hop.upgradeJob.consecutiveFailures)}
                        </Label>
                      )}
                    </Flex>
                  ) : (
                    <span className="ibmz-muted">No CI data</span>
                  )}
                </div>

                <div className="ibmz-upgrade-hop-pass">
                  <div className="ibmz-upgrade-pass-label">30-day pass</div>
                  {passPct != null && hop.pass ? (
                    <>
                      <div
                        className={`ibmz-upgrade-pass-value${passPct >= 85 ? " ibmz-upgrade-pass-value--good" : passPct >= 60 ? " ibmz-upgrade-pass-value--mid" : " ibmz-upgrade-pass-value--low"}`}
                      >
                        {passPct}%
                      </div>
                      <div className="ibmz-upgrade-pass-detail">
                        {hop.pass.passes}/{hop.pass.total} runs
                      </div>
                    </>
                  ) : (
                    <div className="ibmz-upgrade-pass-value ibmz-muted">—</div>
                  )}
                </div>

                {onShowVersion && (
                  <div className="ibmz-upgrade-hop-action">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLinkAltIcon />}
                      iconPosition="right"
                      onClick={() => onShowVersion(hop.to)}
                    >
                      Open OCP {hop.to}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
