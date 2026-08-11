import { Button, Flex, FlexItem, Tooltip } from "@patternfly/react-core";
import { MoonIcon, SunIcon } from "@patternfly/react-icons";
import type { Theme } from "../theme";

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
      <FlexItem>
        <Tooltip content={isDark ? "Switch to light theme" : "Switch to dark theme"}>
          <Button
            variant="control"
            size="sm"
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
            aria-pressed={isDark}
            className="ibmz-theme-toggle"
            onClick={() => onChange(isDark ? "light" : "dark")}
            icon={isDark ? <SunIcon /> : <MoonIcon />}
          >
            {isDark ? "Light" : "Dark"}
          </Button>
        </Tooltip>
      </FlexItem>
    </Flex>
  );
}
