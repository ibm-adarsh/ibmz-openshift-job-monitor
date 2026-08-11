import { Label } from "@patternfly/react-core";
import {
  CheckCircleIcon,
  TimesCircleIcon,
  ExclamationTriangleIcon,
  SyncAltIcon,
  BanIcon,
  UnknownIcon,
  PauseCircleIcon,
} from "@patternfly/react-icons";
import type { JobOutcome } from "../types";

interface OutcomeMeta {
  text: string;
  color: "green" | "red" | "orange" | "blue" | "purple" | "grey" | "yellow";
  icon: React.ReactNode;
}

const META: Record<JobOutcome, OutcomeMeta> = {
  success:   { text: "Success",      color: "green",  icon: <CheckCircleIcon /> },
  failure:   { text: "Failure",      color: "red",    icon: <TimesCircleIcon /> },
  flaking:   { text: "Flaking",      color: "orange", icon: <ExclamationTriangleIcon /> },
  upgrade:   { text: "Upgrade issue", color: "purple", icon: <TimesCircleIcon /> },
  running:   { text: "Running",      color: "blue",   icon: <SyncAltIcon /> },
  aborted:   { text: "Aborted",      color: "grey",   icon: <BanIcon /> },
  pending:   { text: "Pending",      color: "yellow", icon: <PauseCircleIcon /> },
  unknown:   { text: "Unknown",      color: "grey",   icon: <UnknownIcon /> },
  "no-data": { text: "No history",   color: "grey",   icon: <UnknownIcon /> },
};

const PULSE_STYLE = `
@keyframes pf-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
`;
if (typeof document !== "undefined" && !document.getElementById("pf-status-pulse")) {
  const s = document.createElement("style");
  s.id = "pf-status-pulse";
  s.textContent = PULSE_STYLE;
  document.head.appendChild(s);
}

export function StatusLabel({ outcome }: { outcome: JobOutcome }) {
  const meta = META[outcome];
  const isLive = outcome === "running" || outcome === "pending";
  return (
    <Label
      color={meta.color}
      isCompact
      icon={meta.icon}
      style={isLive ? { animation: "pf-status-pulse 1.4s ease-in-out infinite", display: "inline-flex" } : undefined}
    >
      {meta.text}
    </Label>
  );
}
