import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Masthead,
  MastheadMain,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  Page,
  PageSection,
  Title,
  Content,
  Stack,
  StackItem,
  Alert,
  Progress,
  ProgressSize,
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem,
  Label,
  Button,
  Tooltip,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import "@patternfly/react-core/dist/styles/base.css";
import { groupByVersion, isEosVersion, loadInventoryJobs } from "./data/inventory";
import { hydrateJobsLive, type LiveLoadProgress } from "./data/hydrateLive";
import { JobFilters, type FilterState } from "./components/JobFilters";
import { VersionSwimlane } from "./components/VersionSwimlane";
import { JobDetailDrawer } from "./components/JobDetailDrawer";
import { HealthHeatmap } from "./components/HealthHeatmap";
import { UpgradeChain } from "./components/UpgradeChain";
import { ReleaseReadinessCard } from "./components/ReleaseReadinessCard";
import { FleetSummary } from "./components/FleetSummary";
import type { JobCategory, JobType, HistoryWindow, ZJob } from "./types";
import { sippyReleaseUrl } from "./utils/links";
import { HistoryWindowPicker } from "./components/HistoryWindowPicker";
import { TermHint } from "./components/TermHint";
import { IstGreetingClock } from "./components/IstGreetingClock";

const WATCHLIST_KEY = "ibmz-watchlist-v1";
const HISTORY_WINDOW_KEY = "ibmz-history-window-v1";

function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveWatchlist(set: Set<string>) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...set]));
}
function loadHistoryWindow(): HistoryWindow {
  try {
    const raw = localStorage.getItem(HISTORY_WINDOW_KEY);
    return raw === "last-10" ? "last-10" : "last-30-days";
  } catch {
    return "last-30-days";
  }
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  category: "all",
  jobType: "all",
  failingOnly: false,
  hideEos: true,
  requiredOnly: false,
  neverPassedOnly: false,
  watchlistOnly: false,
  ocpVersion: "all",
};

function App() {
  const inventory = useMemo(() => loadInventoryJobs(), []);
  const [jobs, setJobs] = useState<ZJob[]>(inventory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LiveLoadProgress | null>(null);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<ZJob | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [watchlist, setWatchlist] = useState<Set<string>>(loadWatchlist);
  const [autoRefreshSecs, setAutoRefreshSecs] = useState(0);
  const [activeTab, setActiveTab] = useState<string | number>("jobs");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>(loadHistoryWindow);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem(HISTORY_WINDOW_KEY, historyWindow);
  }, [historyWindow]);

  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    if (autoRefreshSecs > 0) {
      autoRefreshRef.current = setInterval(() => setReloadKey((k) => k + 1), autoRefreshSecs * 1000);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefreshSecs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setActiveTab("jobs");
        window.setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>("#z-job-filters input");
          input?.focus();
          input?.select();
        }, 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setProgress({ phase: "Starting…", done: 0, total: 1 });
    setJobs(inventory);

    hydrateJobsLive(inventory, setProgress, ac.signal)
      .then((live) => {
        if (ac.signal.aborted) return;
        setJobs(live);
        setRefreshedAt(new Date());
        setLoading(false);
        setProgress(null);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        setProgress(null);
      });

    return () => ac.abort();
  }, [inventory, reloadKey]);

  const handleToggleWatch = useCallback((id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const handleHeatmapFilter = useCallback((version: string, jobType: JobType) => {
    setFilters((f) => ({
      ...f,
      ocpVersion: version,
      jobType,
      hideEos: isEosVersion(version) ? false : f.hideEos,
    }));
    setActiveTab("jobs");
    window.setTimeout(() => {
      document.getElementById(`ocp-${version}-toggle`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, []);

  const goToJobs = useCallback((patch: Partial<FilterState>) => {
    setFilters((f) => {
      const next = { ...f, ...patch };
      // Keep Hide EOS on unless the user is drilling into an EOS version.
      if (patch.ocpVersion && patch.ocpVersion !== "all" && isEosVersion(patch.ocpVersion)) {
        next.hideEos = false;
      }
      return next;
    });
    setActiveTab("jobs");
  }, []);

  const handleShowFailing = useCallback(() => {
    goToJobs({
      failingOnly: true,
      category: "all",
      jobType: "all",
      ocpVersion: "all",
      search: "",
    });
  }, [goToJobs]);

  const handleShowCategory = useCallback(
    (category: Exclude<JobCategory, "all">) => {
      goToJobs({
        category,
        failingOnly: false,
        jobType: "all",
        ocpVersion: "all",
        search: "",
      });
    },
    [goToJobs],
  );

  const handleShowVersion = useCallback(
    (version: string) => {
      goToJobs({
        ocpVersion: version,
        failingOnly: false,
        category: "all",
        jobType: "all",
        search: "",
      });
      window.setTimeout(() => {
        document
          .getElementById(`ocp-${version}-toggle`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    },
    [goToJobs],
  );

  const availableVersions = useMemo(
    () =>
      [...new Set(inventory.map((j) => j.ocpVersion))].sort((a, b) => {
        const [amaj, amin] = a.split(".").map(Number);
        const [bmaj, bmin] = b.split(".").map(Number);
        if (amaj !== bmaj) return bmaj - amaj;
        return bmin - amin;
      }),
    [inventory],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (filters.hideEos && isEosVersion(job.ocpVersion)) return false;
      if (filters.category !== "all" && job.category !== filters.category) return false;
      if (filters.jobType !== "all" && job.jobType !== filters.jobType) return false;
      if (filters.requiredOnly && !job.requiredForRelease) return false;
      if (filters.neverPassedOnly && !job.neverPassed) return false;
      if (filters.watchlistOnly && !watchlist.has(job.id)) return false;
      if (filters.ocpVersion !== "all" && job.ocpVersion !== filters.ocpVersion) return false;
      if (filters.failingOnly) {
        const terminal = job.latestTerminalOutcome ?? job.latestOutcome;
        if (!["failure", "flaking", "aborted", "upgrade"].includes(terminal)) return false;
      }
      if (!q) return true;
      return (
        job.name.toLowerCase().includes(q) ||
        job.ocpVersion.includes(q) ||
        job.jobType.toLowerCase().includes(q) ||
        job.category.toLowerCase().includes(q) ||
        job.configFile.toLowerCase().includes(q) ||
        job.periodicName.toLowerCase().includes(q)
      );
    });
  }, [jobs, filters, watchlist]);

  const versions = useMemo(() => groupByVersion(filtered), [filtered]);

  const visibleJobPool = useMemo(
    () => jobs.filter((j) => !filters.hideEos || !isEosVersion(j.ocpVersion)),
    [jobs, filters.hideEos],
  );

  const allVersionGroups = useMemo(() => groupByVersion(jobs), [jobs]);
  const activeJobs = useMemo(() => jobs.filter((j) => !isEosVersion(j.ocpVersion)), [jobs]);
  const liveCount = activeJobs.filter((j) => j.dataProvenance === "live").length;
  const partialCount = activeJobs.filter((j) => j.dataProvenance === "partial").length;
  const failingCount = activeJobs.filter((j) => j.latestTerminalOutcome === "failure").length;
  const runningCount = activeJobs.filter(
    (j) => j.latestOutcome === "running" || j.latestOutcome === "pending",
  ).length;

  const header = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo href="/" style={{ textDecoration: "none" }}>
            <Title headingLevel="h1" size="lg">
              IBM Z OpenShift Job Monitor
            </Title>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent className="ibmz-masthead-meta">
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsCenter" }}
          flexWrap={{ default: "wrap" }}
          gap={{ default: "gapMd" }}
          style={{ width: "100%" }}
        >
          <FlexItem grow={{ default: "grow" }}>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapMd" }} flexWrap={{ default: "wrap" }}>
              <FlexItem>
                <Content component="small">
                  Live CI from{" "}
                  <TermHint meaning="Sippy tracks pass-rate trends and job health across OpenShift CI.">
                    Sippy
                  </TermHint>{" "}
                  +{" "}
                  <TermHint meaning="Prow stores individual job runs and build logs for each periodic.">
                    Prow
                  </TermHint>{" "}
                  ·{" "}
                  <TermHint meaning="IBM Z architecture (s390x). This dashboard only includes Z-related jobs.">
                    IBM Z (s390x)
                  </TermHint>{" "}
                  ·{" "}
                  <a href={sippyReleaseUrl("5.0")} target="_blank" rel="noreferrer">
                    open Sippy for OCP 5.0
                  </a>
                </Content>
              </FlexItem>
              <FlexItem>
                <Tooltip
                  content={`${liveCount} of ${activeJobs.length} supported (non-EOS) jobs have completed run history. ${partialCount} have Sippy stats only.`}
                >
                  <Label color="green" isCompact>
                    {liveCount}/{activeJobs.length} with run history
                  </Label>
                </Tooltip>
              </FlexItem>
              {runningCount > 0 && (
                <FlexItem>
                  <Tooltip content="Jobs currently running or pending (newest build not finished yet).">
                    <Label color="blue" isCompact>
                      {runningCount} running now
                    </Label>
                  </Tooltip>
                </FlexItem>
              )}
              {failingCount > 0 && (
                <FlexItem>
                  <Tooltip content="Supported jobs whose most recent finished run failed.">
                    <Label color="red" isCompact>
                      {failingCount} last finished run failed
                    </Label>
                  </Tooltip>
                </FlexItem>
              )}
              <FlexItem>
                <Button
                  variant="link"
                  isInline
                  icon={<SyncAltIcon />}
                  onClick={() => setReloadKey((k) => k + 1)}
                  isDisabled={loading}
                >
                  Refresh
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
          <FlexItem>
            <IstGreetingClock />
          </FlexItem>
        </Flex>
      </MastheadContent>
    </Masthead>
  );

  return (
    <Page masthead={header}>
      <JobDetailDrawer job={selected} onClose={() => setSelected(null)}>
        <PageSection type="tabs" isWidthLimited={false}>
          <Tabs
            activeKey={activeTab}
            onSelect={(_e, key) => setActiveTab(key)}
            aria-label="IBM Z job monitor views"
            usePageInsets
          >
            <Tab eventKey="jobs" title={<TabTitleText>Jobs</TabTitleText>} />
            <Tab eventKey="summary" title={<TabTitleText>Summary</TabTitleText>} />
          </Tabs>
        </PageSection>

        <PageSection>
          <Stack hasGutter>
            {loading && progress && (
              <StackItem>
                <Alert variant="info" title={progress.phase} isInline>
                  <Progress
                    value={progress.total ? (progress.done / progress.total) * 100 : 0}
                    title={`${progress.done} / ${progress.total}`}
                    size={ProgressSize.sm}
                    measureLocation="outside"
                  />
                </Alert>
              </StackItem>
            )}
            {error && (
              <StackItem>
                <Alert variant="danger" title="Live fetch failed" isInline>
                  {error}
                </Alert>
              </StackItem>
            )}

            {activeTab === "jobs" && (
              <>
                <StackItem className="ibmz-jobs-toolbar-sticky">
                  <HistoryWindowPicker
                    value={historyWindow}
                    onChange={setHistoryWindow}
                    disabled={loading}
                  />
                </StackItem>
                <StackItem className="ibmz-jobs-toolbar-sticky">
                  <JobFilters
                    filters={filters}
                    onChange={setFilters}
                    availableVersions={availableVersions}
                  />
                </StackItem>
                <StackItem>
                  <Content component="small">
                    Showing <strong>{filtered.length}</strong> of <strong>{visibleJobPool.length}</strong> jobs
                    {" · "}
                    Runs column shows{" "}
                    <strong>
                      {historyWindow === "last-10" ? "Last 10 Runs" : "Last 30 Days"}
                    </strong>
                    {" · "}
                    Pass rate (7d / 30d) uses <strong>all runs fetched from CI</strong> — not just
                    what the bars show
                    {" · "}
                    Updated {refreshedAt.toLocaleString()}
                  </Content>
                </StackItem>
                <StackItem>
                  <Stack hasGutter>
                    {versions.map((v) => (
                      <StackItem key={v.version}>
                        <VersionSwimlane
                          summary={v}
                          onSelectJob={setSelected}
                          historyWindow={historyWindow}
                          watchlist={watchlist}
                          onToggleWatch={handleToggleWatch}
                        />
                      </StackItem>
                    ))}
                    {versions.length === 0 && !loading && (
                      <Alert variant="warning" title="No jobs match the current filters" isInline />
                    )}
                  </Stack>
                </StackItem>
              </>
            )}

            {activeTab === "summary" && (
              <>
                <StackItem>
                  <FleetSummary
                    jobs={jobs}
                    versions={allVersionGroups}
                    refreshedAt={refreshedAt}
                    onRefresh={() => setReloadKey((k) => k + 1)}
                    autoRefreshSecs={autoRefreshSecs}
                    onAutoRefreshChange={setAutoRefreshSecs}
                    onShowFailing={handleShowFailing}
                    onShowCategory={handleShowCategory}
                    onShowVersion={handleShowVersion}
                    details={
                      !loading ? (
                        <>
                          <ReleaseReadinessCard versions={allVersionGroups} />
                          <HealthHeatmap
                            versions={allVersionGroups}
                            onFilterByVersionType={handleHeatmapFilter}
                          />
                          <UpgradeChain versions={allVersionGroups} onShowVersion={handleShowVersion} />
                        </>
                      ) : (
                        <Alert variant="info" title="Loading live metrics…" isInline>
                          Detail panels appear after hydration completes.
                        </Alert>
                      )
                    }
                  />
                </StackItem>
              </>
            )}
          </Stack>
        </PageSection>
      </JobDetailDrawer>
    </Page>
  );
}

export default App;
