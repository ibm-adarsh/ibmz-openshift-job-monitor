import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  DrawerPanelBody,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Title,
  Tooltip,
} from "@patternfly/react-core";
import {
  ExternalLinkAltIcon,
  CopyIcon,
  CheckIcon,
} from "@patternfly/react-icons";
import { useState } from "react";
import type { ZJob } from "../types";
import { StatusLabel } from "./StatusLabel";
import { RunSparkline } from "./RunSparkline";
import { PassRatePair } from "./PassRatePair";
import { formatAbsolute, formatRelative } from "../utils/format";
import { isStreakFlaking, statusOutcomeForJob } from "../utils/stats";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : `Copy ${label}`}>
      <Button
        variant="plain"
        aria-label={`Copy ${label}`}
        icon={copied ? <CheckIcon /> : <CopyIcon />}
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      />
    </Tooltip>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="link"
      component="a"
      href={href}
      target="_blank"
      rel="noreferrer"
      icon={<ExternalLinkAltIcon />}
      iconPosition="end"
      isInline
    >
      {children}
    </Button>
  );
}

/** Color for days-gap SLA */
function dayGapColor(days: number | null): string | undefined {
  if (days == null) return undefined;
  if (days > 14) return "var(--pf-t--global--color--status--danger--default)";
  if (days > 7) return "var(--pf-t--global--color--status--warning--default)";
  return undefined;
}

interface JobDetailDrawerProps {
  job: ZJob | null;
  onClose: () => void;
  children: React.ReactNode;
}

export function JobDetailDrawer({ job, onClose, children }: JobDetailDrawerProps) {
  const [showAllRuns, setShowAllRuns] = useState(false);

  const panel = job ? (
    <DrawerPanelContent widths={{ default: "width_33", xl: "width_25" }} minSize="360px">
      <DrawerHead>
        <Title headingLevel="h2" size="lg">
          {job.name}
        </Title>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        <Flex direction={{ default: "column" }} gap={{ default: "gapMd" }}>

          {/* Status labels */}
          <FlexItem>
            <LabelGroup>
              <StatusLabel outcome={statusOutcomeForJob(job)} />
              <Label isCompact color="blue">
                OCP {job.ocpVersion}
              </Label>
              {job.category === "upgrade" ? (
                <Label isCompact color="purple">
                  Upgrade
                  {job.upgradeFrom ? ` from ${job.upgradeFrom}` : ""}
                </Label>
              ) : (
                <>
                  <Label isCompact color="blue">
                    {job.jobType}
                  </Label>
                  <Label
                    isCompact
                    color={job.category === "heterogeneous" ? "purple" : "grey"}
                  >
                    {job.category === "heterogeneous" ? "Heterogeneous" : "Homogeneous"}
                  </Label>
                </>
              )}
              {job.name.endsWith("-x-xz") && (
                <Label isCompact color="purple">
                  x-xz
                </Label>
              )}
              {job.name.endsWith("-z-xz") && (
                <Label isCompact color="purple">
                  z-xz
                </Label>
              )}
              {job.name.endsWith("-z-za") && (
                <Label isCompact color="purple">
                  z-za
                </Label>
              )}
              {job.name.endsWith("-heterogeneous") && (
                <Label isCompact color="purple">
                  heterogeneous
                </Label>
              )}
              {job.requiredForRelease && (
                <Label isCompact color="orange">
                  Release gate
                </Label>
              )}
              {job.neverPassed && (
                <Label isCompact color="red">
                  never passed
                </Label>
              )}
              {!job.neverPassed && job.noGreenInLoadedRuns && !job.lastSuccessAt && (
                <Label isCompact color="orange">
                  no green in loaded runs
                </Label>
              )}
            </LabelGroup>
          </FlexItem>

          {/* Description list */}
          <FlexItem>
            <DescriptionList isCompact isHorizontal horizontalTermWidthModifier={{ default: "14ch" }}>
              <DescriptionListGroup>
                <DescriptionListTerm>Latest run</DescriptionListTerm>
                <DescriptionListDescription>
                  {formatRelative(job.latestRunAt)} ({formatAbsolute(job.latestRunAt)})
                  {job.latestDurationMinutes != null ? ` · ${job.latestDurationMinutes}m` : ""}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Last finished</DescriptionListTerm>
                <DescriptionListDescription>
                  {job.latestTerminalOutcome ? (
                    <>
                      <StatusLabel outcome={job.latestTerminalOutcome} />{" "}
                      {formatRelative(job.latestTerminalAt)}
                    </>
                  ) : (
                    "—"
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Last success</DescriptionListTerm>
                <DescriptionListDescription>
                  <span style={{ color: dayGapColor(job.daysSinceLastSuccess) }}>
                    {formatRelative(job.lastSuccessAt)}
                    {job.lastSuccessSource === "sippy" ? " (Sippy last_pass)" : ""}
                    {job.daysSinceLastSuccess != null
                      ? ` · ${job.daysSinceLastSuccess}d gap`
                      : ""}
                    {(job.daysSinceLastSuccess ?? 0) > 14 ? " ⚠ SLA breach" : ""}
                    {(job.daysSinceLastSuccess ?? 0) > 7 &&
                    (job.daysSinceLastSuccess ?? 0) <= 14
                      ? " ⚑ at risk"
                      : ""}
                  </span>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Streak</DescriptionListTerm>
                <DescriptionListDescription>
                  {job.consecutiveFailures > 0
                    ? `${job.consecutiveFailures}× consecutive failures`
                    : isStreakFlaking(job)
                      ? "OK · Flaking (≤25% pass in 7d or 30d)"
                      : "OK — no consecutive failures"}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Pass rates</DescriptionListTerm>
                <DescriptionListDescription>
                  <PassRatePair
                    passRate7d={job.passRate7d}
                    passRate30d={job.passRate30d}
                    runs7d={job.runs7d}
                    passes7d={job.passes7d}
                    runs30d={job.runs30d}
                    passes30d={job.passes30d}
                    showLastN={job.lastN != null && job.lastN > 0}
                    passRateLastN={job.passRateLastN}
                    lastN={job.lastN}
                    passesLastN={job.passesLastN}
                    windowComplete7d={job.windowComplete7d}
                    windowComplete30d={job.windowComplete30d}
                  />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Sippy aggregate</DescriptionListTerm>
                <DescriptionListDescription>
                  {job.sippyCurrentPassPct == null
                    ? "—"
                    : `${job.sippyCurrentPassPct}% (n=${job.sippyCurrentRuns ?? 0})`}
                  {job.sippyPreviousPassPct != null
                    ? ` · previous ${job.sippyPreviousPassPct}%`
                    : ""}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Owner</DescriptionListTerm>
                <DescriptionListDescription>{job.owner}</DescriptionListDescription>
              </DescriptionListGroup>
              {job.upgradeFrom && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Upgrade from</DescriptionListTerm>
                  <DescriptionListDescription>{job.upgradeFrom}</DescriptionListDescription>
                </DescriptionListGroup>
              )}
              <DescriptionListGroup>
                <DescriptionListTerm>Data</DescriptionListTerm>
                <DescriptionListDescription>
                  {job.dataProvenance}
                  {job.history[0]?.source ? ` · history via ${job.history[0].source}` : ""}
                  {job.liveError ? (
                    <div
                      style={{
                        color: "var(--pf-t--global--text--color--subtle)",
                        fontSize: "var(--pf-t--global--font--size--xs)",
                        marginTop: 2,
                        wordBreak: "break-all",
                      }}
                    >
                      {job.liveError}
                    </div>
                  ) : null}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </FlexItem>

          {/* Sparkline */}
          {job.history.length > 0 && (
            <FlexItem>
              <Title headingLevel="h3" size="md">
                Recent runs (last {Math.min(job.history.length, 20)})
              </Title>
              <div style={{ marginTop: 8 }}>
                <RunSparkline history={job.history} showAxis />
              </div>
            </FlexItem>
          )}

          {/* Full run history table */}
          {job.history.length > 0 && (
            <FlexItem>
              <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                <Title headingLevel="h3" size="md">
                  Run history ({job.history.length} runs)
                </Title>
                <Button variant="link" isInline onClick={() => setShowAllRuns((v) => !v)}>
                  {showAllRuns ? "Collapse" : "Expand all"}
                </Button>
              </Flex>
              <div
                className={`ibmz-drawer-history-wrap${showAllRuns ? " ibmz-drawer-history-wrap--expanded" : ""}`}
              >
                <table className="ibmz-drawer-history-table" aria-label="Run history">
                  <thead>
                    <tr>
                      <th>Outcome</th>
                      <th>Started</th>
                      <th className="ibmz-drawer-num">Duration</th>
                      <th className="ibmz-drawer-link-col">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.history.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <StatusLabel outcome={run.outcome} />
                        </td>
                        <td className="ibmz-muted-cell">
                          {formatAbsolute(run.startedAt)}
                        </td>
                        <td className="ibmz-drawer-num ibmz-muted-cell">
                          {run.durationMinutes != null ? `${run.durationMinutes}m` : "—"}
                        </td>
                        <td className="ibmz-drawer-link-col">
                          <a href={run.prowUrl} target="_blank" rel="noreferrer" title={run.id}>
                            <ExternalLinkAltIcon />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FlexItem>
          )}

          {/* Periodic name */}
          <FlexItem>
            <Title headingLevel="h3" size="md">
              Periodic name
            </Title>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapXs" }}>
              <code style={{ fontSize: "var(--pf-t--global--font--size--sm)", wordBreak: "break-all" }}>
                {job.periodicName}
              </code>
              <CopyButton text={job.periodicName} label="periodic name" />
            </Flex>
          </FlexItem>

          {/* External links */}
          <FlexItem>
            <Title headingLevel="h3" size="md">
              Links
            </Title>
            <Flex direction={{ default: "column" }} gap={{ default: "gapSm" }} style={{ marginTop: 8 }}>
              <ExtLink href={job.links.prowHistory}>Prow job history</ExtLink>
              <ExtLink href={job.links.prowDeck}>Prow deck search</ExtLink>
              <ExtLink href={job.links.config}>Config YAML (openshift/release)</ExtLink>
              <ExtLink href={job.links.sippy}>Sippy job runs</ExtLink>
              <ExtLink href={job.links.testgrid}>TestGrid search</ExtLink>
            </Flex>
            <Flex
              alignItems={{ default: "alignItemsCenter" }}
              gap={{ default: "gapSm" }}
              flexWrap={{ default: "wrap" }}
              style={{ marginTop: 8 }}
            >
              <code style={{ fontSize: "var(--pf-t--global--font--size--sm)" }}>
                {job.configFile}
              </code>
              <CopyButton text={job.configFile} label="config file" />
            </Flex>
            <div style={{ marginTop: 6, color: "var(--ibmz-muted)", fontSize: "var(--pf-t--global--font--size--sm)" }}>
              Variant: <code>{job.links.variant}</code>
            </div>
          </FlexItem>
        </Flex>
      </DrawerPanelBody>
    </DrawerPanelContent>
  ) : null;

  return (
    <Drawer isExpanded={!!job} position="right">
      <DrawerContent panelContent={panel}>
        <DrawerContentBody>{children}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
