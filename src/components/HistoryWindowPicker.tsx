import { Flex, FlexItem, Label, ToggleGroup, ToggleGroupItem, Tooltip } from "@patternfly/react-core";
import type { HistoryWindow } from "../types";

interface HistoryWindowPickerProps {
  value: HistoryWindow;
  onChange: (next: HistoryWindow) => void;
  disabled?: boolean;
}

/**
 * Compact inline strip that lets users switch between "last 10 runs" and
 * "last 30 days" history mode. Also shows the sparkline legend.
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
              text="Last 10 Runs"
              isSelected={value === "last-10"}
              onChange={() => onChange("last-10")}
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
            content="Only changes the colored bars in the Runs column. 7-day and 30-day pass rates still use the full Passed/Total data fetched from Sippy/Prow (up to 100 runs per job)."
          >
            <span
              style={{
                fontSize: "var(--pf-t--global--font--size--xs)",
                color: "var(--pf-t--global--text--color--subtle)",
                cursor: "help",
                borderBottom: "1px dotted currentColor",
              }}
            >
              Pass rates unchanged
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
              { color: "orange", text: "Flaking" },
              { color: "blue", text: "Running" },
              { color: "grey", text: "Aborted/no-data" },
            ] as const
          ).map((l) => (
            <Label key={l.text} isCompact color={l.color}>
              {l.text}
            </Label>
          ))}
          <Tooltip content="Pass meter: green ≥85% · amber ≥60% · red <60%">
            <span
              style={{
                fontSize: "var(--pf-t--global--font--size--xs)",
                color: "var(--pf-t--global--text--color--subtle)",
                cursor: "help",
                borderBottom: "1px dashed var(--pf-t--global--text--color--subtle)",
              }}
            >
              Pass %: ≥85 green · ≥60 amber · &lt;60 red
            </span>
          </Tooltip>
        </Flex>
      </FlexItem>
    </Flex>
  );
}
