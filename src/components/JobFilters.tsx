import {
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  ToggleGroup,
  ToggleGroupItem,
  Checkbox,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  type MenuToggleElement,
  Button,
  Tooltip,
} from "@patternfly/react-core";
import { StarIcon } from "@patternfly/react-icons";
import { useState, type Ref } from "react";
import type { JobCategory, JobType } from "../types";

export interface FilterState {
  search: string;
  category: JobCategory;
  jobType: "all" | JobType;
  failingOnly: boolean;
  requiredOnly: boolean;
  neverPassedOnly: boolean;
  watchlistOnly: boolean;
  ocpVersion: string;
}

interface JobFiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  availableVersions: string[];
}

const CATEGORIES: { id: JobCategory; label: string; tip?: string }[] = [
  { id: "all", label: "All" },
  { id: "homogeneous", label: "Homogeneous", tip: "Single-arch Z jobs (s390x, multi-z-z, VPN, …)" },
  {
    id: "heterogeneous",
    label: "Heterogeneous",
    tip: "*-x-xz, *-z-xz, and *-z-za topologies (mixed arch + Z)",
  },
  { id: "upgrade", label: "Upgrade" },
];

const JOB_TYPES: Array<"all" | JobType> = [
  "all",
  "e2e",
  "serial",
  "fips",
  "image-ecosystem",
  "upgrade",
  "agent",
  "techpreview",
];

const EMPTY: FilterState = {
  search: "",
  category: "all",
  jobType: "all",
  failingOnly: false,
  requiredOnly: false,
  neverPassedOnly: false,
  watchlistOnly: false,
  ocpVersion: "all",
};

export function JobFilters({ filters, onChange, availableVersions }: JobFiltersProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const versionOptions = ["all", ...availableVersions];

  return (
    <Toolbar id="z-job-filters" className="ibmz-filters-toolbar" clearAllFilters={() => onChange(EMPTY)}>
      <ToolbarContent>
        <ToolbarGroup variant="filter-group" className="ibmz-filters-row">
          <ToolbarItem>
            <ToggleGroup aria-label="Job family">
              {CATEGORIES.map((c) => {
                const item = (
                  <ToggleGroupItem
                    text={c.label}
                    isSelected={filters.category === c.id}
                    onChange={() => onChange({ ...filters, category: c.id })}
                  />
                );
                return c.tip ? (
                  <Tooltip key={c.id} content={c.tip}>
                    <span>{item}</span>
                  </Tooltip>
                ) : (
                  <span key={c.id}>{item}</span>
                );
              })}
            </ToggleGroup>
          </ToolbarItem>

          <ToolbarItem>
            <Select
              id="job-type-select"
              isOpen={typeOpen}
              selected={filters.jobType}
              onSelect={(_e, value) => {
                onChange({ ...filters, jobType: value as FilterState["jobType"] });
                setTypeOpen(false);
              }}
              onOpenChange={setTypeOpen}
              toggle={(toggleRef: Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setTypeOpen(!typeOpen)}
                  isExpanded={typeOpen}
                  style={{ minWidth: 160 }}
                >
                  Type: {filters.jobType === "all" ? "All" : filters.jobType}
                </MenuToggle>
              )}
            >
              <SelectList>
                {JOB_TYPES.map((t) => (
                  <SelectOption key={t} value={t}>
                    {t === "all" ? "All" : t}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </ToolbarItem>

          <ToolbarItem>
            <Select
              id="ocp-version-select"
              isOpen={versionOpen}
              selected={filters.ocpVersion}
              onSelect={(_e, value) => {
                onChange({ ...filters, ocpVersion: String(value) });
                setVersionOpen(false);
              }}
              onOpenChange={setVersionOpen}
              toggle={(toggleRef: Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setVersionOpen(!versionOpen)}
                  isExpanded={versionOpen}
                  style={{ minWidth: 130 }}
                >
                  OCP: {filters.ocpVersion === "all" ? "All" : filters.ocpVersion}
                </MenuToggle>
              )}
            >
              <SelectList>
                {versionOptions.map((v) => (
                  <SelectOption key={v} value={v}>
                    {v === "all" ? "All versions" : `OCP ${v}`}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </ToolbarItem>

          <ToolbarItem>
            <SearchInput
              placeholder="Search jobs (⌘K)"
              value={filters.search}
              onChange={(_e, value) => onChange({ ...filters, search: value })}
              onClear={() => onChange({ ...filters, search: "" })}
              aria-label="Search jobs"
              style={{ minWidth: 220 }}
            />
          </ToolbarItem>
        </ToolbarGroup>

        <ToolbarGroup variant="filter-group" className="ibmz-filters-row ibmz-filters-checks">
          <ToolbarItem>
            <Checkbox
              id="failing-only"
              label="Failing only"
              isChecked={filters.failingOnly}
              onChange={(_e, checked) => onChange({ ...filters, failingOnly: checked })}
            />
          </ToolbarItem>
          <ToolbarItem>
            <Tooltip content="Jobs Sippy reports as never having a last_pass (no recorded green run).">
              <Checkbox
                id="never-passed-only"
                label="Never passed"
                isChecked={filters.neverPassedOnly}
                onChange={(_e, checked) => onChange({ ...filters, neverPassedOnly: checked })}
              />
            </Tooltip>
          </ToolbarItem>
          <ToolbarItem>
            <Tooltip content="Show only jobs required for release readiness (e2e, serial, upgrade).">
              <Checkbox
                id="required-only"
                label="Release gates only"
                isChecked={filters.requiredOnly}
                onChange={(_e, checked) => onChange({ ...filters, requiredOnly: checked })}
              />
            </Tooltip>
          </ToolbarItem>
          <ToolbarItem>
            <Button
              variant={filters.watchlistOnly ? "primary" : "secondary"}
              icon={<StarIcon />}
              size="sm"
              onClick={() => onChange({ ...filters, watchlistOnly: !filters.watchlistOnly })}
            >
              Watchlist
            </Button>
          </ToolbarItem>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );
}
