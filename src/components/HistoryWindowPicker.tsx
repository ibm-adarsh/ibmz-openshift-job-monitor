import { Flex, FlexItem, Label, ToggleGroup, ToggleGroupItem, Tooltip } from "@patternfly/react-core";
import type { HistoryWindow } from "../types";

interface HistoryWindowPickerProps {
  value: HistoryWindow;
  onChange: (next: HistoryWindow) => void;
  disabled?: boolean;
}

/**
 * Compact inline strip: Last 7 Runs (default 15-day CI fetch) vs Last 30 Days
 * (refetch with 30-day history). Sparkline always shows at most 7 bars.
 */
export function HistoryWindowPicker({ value, onChange, disabled }: HistoryWindowPickerProps) {
  return (
    <Flex
      alignItems={{ default: "alignItemsCenter" }}
      flexWrap={{ default: "wrap" }}
      gap={{ default: "gapMd" }}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
      }}
      className="ibmz-history-strip"
    >
      {/* Window toggle */}
      <FlexItem>
        <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
          <span className="ibmz-history-strip-label">Runs column:</span>
          <ToggleGroup aria-label="History window" isCompact>
            <ToggleGroupItem
              text="Last 7 Runs"
              isSelected={value === "last-7"}
              onChange={() => onChange("last-7")}
              isDisabled={disabled}
            />
            <ToggleGroupItem
              text="Last 30 Days"
              isSelected={value === "last-30-days"}
              onChange={() => onChange("last-30-days")}
              isDisabled={disabled}
            />
          </ToggleGroup>
          <Tooltip
            content="Default loads ~15 days of CI history per job. Choosing Last 30 Days refetches up to 30 days. Streak bars always show the newest 7 runs."
          >
            <span
              style={{
                fontSize: "var(--pf-t--global--font--size--xs)",
                color: "var(--pf-t--global--text--color--subtle)",
                cursor: "help",
                borderBottom: "1px dotted currentColor",
              }}
            >
              Default 15d fetch · 30d on demand
            </span>
          </Tooltip>
        </Flex>
      </FlexItem>

      {/* Divider */}
      <FlexItem>
        <div className="ibmz-history-divider" />
      </FlexItem>

      {/* Legend */}
      <FlexItem>
        <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
          <span
            style={{
              fontSize: "var(--pf-t--global--font--size--xs)",
              color: "var(--pf-t--global--text--color--subtle)",
            }}
          >
            Bar colours:
          </span>
          {(
            [
              { color: "green", text: "Success" },
              { color: "red", text: "Failure" },
              { color: "blue", text: "Running" },
              { color: "grey", text: "Aborted/no-data" },
            ] as const
          ).map((l) => (
            <Label key={l.text} isCompact color={l.color}>
              {l.text}
            </Label>
          ))}
          <Tooltip content="Pass meter: green ≥60% · amber 40–59% · red <40%">
            <span
              style={{
                fontSize: "var(--pf-t--global--font--size--xs)",
                color: "var(--pf-t--global--text--color--subtle)",
                cursor: "help",
                borderBottom: "1px dashed var(--pf-t--global--text--color--subtle)",
              }}
            >
              Pass %: ≥60 green · 40–59 amber · &lt;40 red
            </span>
          </Tooltip>
        </Flex>
      </FlexItem>
    </Flex>
  );
}
