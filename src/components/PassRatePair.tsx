import { Progress, ProgressSize, ProgressMeasureLocation, Tooltip } from "@patternfly/react-core";

function toneFor(pct: number | null): "success" | "warning" | "danger" | undefined {
  if (pct == null) return undefined;
  if (pct >= 85) return "success";
  if (pct >= 60) return "warning";
  return "danger";
}

function labelFor(pct: number | null, passes?: number | null, total?: number | null): string {
  if (pct == null) return "No data";
  if (passes != null && total != null && total > 0) {
    return `${pct}% (${passes}/${total})`;
  }
  return `${pct}%`;
}

interface PassRateMeterProps {
  label: string;
  passRate: number | null;
  passes?: number | null;
  total?: number | null;
  hint?: string;
  /** When false, show ~ and note that the calendar window may be incomplete. */
  complete?: boolean;
}

/** Single labeled pass-rate meter — green ≥85%, amber ≥60%, red below. */
export function PassRateMeter({
  label,
  passRate,
  passes,
  total,
  hint,
  complete = true,
}: PassRateMeterProps) {
  const value = passRate == null ? 0 : Math.min(100, Math.max(0, passRate));
  const base = labelFor(passRate, passes, total);
  const text = passRate == null ? base : complete ? base : `~${base}`;
  const valueClass =
    passRate == null
      ? "ibmz-pass-meter-value--muted"
      : passRate >= 85
        ? "ibmz-pass-meter-value--good"
        : passRate >= 60
          ? "ibmz-pass-meter-value--mid"
          : "ibmz-pass-meter-value--low";
  const tip = [
    hint,
    complete
      ? null
      : "Approximate: loaded runs may not cover the full calendar window.",
    "Shown as Passed/Total %. Total includes success, fail, flake, and upgrade runs; aborted runs are excluded.",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <div className="ibmz-pass-meter" style={{ minWidth: 110 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
          gap: 8,
        }}
      >
        <span className="ibmz-pass-meter-label">{label}</span>
        <span className={`ibmz-pass-meter-value ${valueClass}`}>{text}</span>
      </div>
      {passRate == null ? (
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--ibmz-surface-muted)",
          }}
        />
      ) : (
        <Progress
          value={value}
          size={ProgressSize.sm}
          measureLocation={ProgressMeasureLocation.none}
          variant={toneFor(passRate)}
          aria-label={`${label} pass rate ${text}`}
        />
      )}
    </div>
  );
  return <Tooltip content={tip}>{body}</Tooltip>;
}

interface PassRatePairProps {
  passRate7d: number | null;
  passRate30d: number | null;
  runs7d?: number | null;
  passes7d?: number | null;
  runs30d?: number | null;
  passes30d?: number | null;
  passRateLastN?: number | null;
  lastN?: number | null;
  passesLastN?: number | null;
  showLastN?: boolean;
  windowComplete7d?: boolean;
  windowComplete30d?: boolean;
}

/** Side-by-side 7-day / 30-day (and optional last-N) pass meters. */
export function PassRatePair({
  passRate7d,
  passRate30d,
  runs7d,
  passes7d,
  runs30d,
  passes30d,
  passRateLastN,
  lastN,
  passesLastN,
  showLastN,
  windowComplete7d = true,
  windowComplete30d = true,
}: PassRatePairProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
      {showLastN && (
        <PassRateMeter
          label={`Last ${lastN ?? 10} Runs`}
          passRate={passRateLastN ?? null}
          passes={passesLastN}
          total={lastN}
          hint={`Passed runs out of the most recent ${lastN ?? 10} scored runs`}
        />
      )}
      <PassRateMeter
        label="7 days"
        passRate={passRate7d}
        passes={passes7d}
        total={runs7d}
        complete={windowComplete7d}
        hint="Passed runs out of total scored runs in the last 7 days"
      />
      <PassRateMeter
        label="30 days"
        passRate={passRate30d}
        passes={passes30d}
        total={runs30d}
        complete={windowComplete30d}
        hint="Passed runs out of total scored runs in the last 30 days"
      />
    </div>
  );
}
