import { useState } from "react";
import {
  ExpandableSection,
  Flex,
  FlexItem,
  Label,
  Tooltip,
} from "@patternfly/react-core";
import type { HistoryWindow, VersionSummary, ZJob } from "../types";
import { JobTable } from "./JobTable";

const HEALTH_COLOR = {
  green: "green",
  yellow: "orange",
  red: "red",
  unknown: "grey",
} as const;

const HEALTH_LABEL = {
  green: "Healthy",
  yellow: "At risk",
  red: "Failing",
  unknown: "No data",
} as const;

const HEALTH_TIP = {
  green: "No critical release-gate failures for this OCP version.",
  yellow: "Some failures or flaking on watched jobs — needs attention.",
  red: "Multiple critical gate failures for this OCP version.",
  unknown: "Not enough live CI data yet to score this version.",
} as const;

interface VersionSwimlaneProps {
  summary: VersionSummary;
  onSelectJob: (job: ZJob) => void;
  watchlist: Set<string>;
  onToggleWatch: (id: string) => void;
  historyWindow: HistoryWindow;
}

export function VersionSwimlane({
  summary,
  onSelectJob,
  watchlist,
  onToggleWatch,
  historyWindow,
}: VersionSwimlaneProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleContent = (
    <Flex
      alignItems={{ default: "alignItemsCenter" }}
      gap={{ default: "gapSm" }}
      flexWrap={{ default: "wrap" }}
    >
      <FlexItem>
        <strong>OCP {summary.version}</strong>
      </FlexItem>
      <FlexItem>
        <Tooltip content={HEALTH_TIP[summary.health]}>
          <Label color={HEALTH_COLOR[summary.health]} isCompact>
            {HEALTH_LABEL[summary.health]}
          </Label>
        </Tooltip>
      </FlexItem>
      {summary.eos && (
        <FlexItem>
          <Tooltip content="End-of-support OCP version — still listed when Hide EOS is off.">
            <Label color="grey" isCompact>
              End of support
            </Label>
          </Tooltip>
        </FlexItem>
      )}
      <FlexItem>
        <span
          style={{
            color: "var(--ibmz-muted)",
            fontSize: "var(--pf-t--global--font--size--sm)",
          }}
        >
          {summary.jobs.length} Jobs · {summary.passing} Passing · {summary.failing} Failing
          {summary.running > 0 ? ` · ${summary.running} Running` : ""}
          {summary.passRate30d != null ? ` · 30d pass ${summary.passRate30d}%` : ""}
        </span>
      </FlexItem>
    </Flex>
  );

  return (
    <div className="ibmz-version-lane">
      <ExpandableSection
        toggleContent={toggleContent}
        isExpanded={expanded}
        onToggle={(_e, isExpanded) => setExpanded(isExpanded)}
        displaySize="lg"
        isIndented
        contentId={`ocp-${summary.version}-jobs`}
        toggleId={`ocp-${summary.version}-toggle`}
      >
        <JobTable
          jobs={summary.jobs}
          onSelectJob={onSelectJob}
          watchlist={watchlist}
          onToggleWatch={onToggleWatch}
          historyWindow={historyWindow}
          stickyHeader
        />
      </ExpandableSection>
    </div>
  );
}
