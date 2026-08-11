import { Tooltip } from "@patternfly/react-core";
import type { ReactNode } from "react";

/** Underlined term — hover to see the meaning. */
export function TermHint({
  meaning,
  children,
}: {
  meaning: string;
  children: ReactNode;
}) {
  return (
    <Tooltip content={meaning}>
      <span
        tabIndex={0}
        style={{
          borderBottom: "1px dotted currentColor",
          cursor: "help",
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}
