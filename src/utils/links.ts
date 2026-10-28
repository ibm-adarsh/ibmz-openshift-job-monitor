/**
 * OpenShift CI link builders for IBM Z periodics (multiarch + hypershift).
 *
 * Periodic naming (from ci-operator-prowgen):
 *   periodic-ci-<org>-<repo>-<branch>-<variant>-<test-as-name>
 *
 * Config files (relative to ci-operator/config/):
 *   openshift/multiarch/openshift-multiarch-main__nightly-5.0.yaml
 *   openshift/hypershift/openshift-hypershift-release-5.0__periodics-mce.yaml
 *
 * Basename form `org-repo-branch__variant.yaml` is also accepted for
 * backward compatibility with older inventory rows.
 */

const GITHUB_CONFIG_ROOT =
  "https://github.com/openshift/release/blob/main/ci-operator/config";
const PROW_LOGS = "https://prow.ci.openshift.org/job-history/gs/test-platform-results/logs";
const PROW_DECK = "https://prow.ci.openshift.org";
const SIPPY = "https://sippy.dptools.openshift.org/sippy-ng";

/** Basename of a config path (or the file itself). */
export function configBasename(configFile: string): string {
  const parts = configFile.split("/");
  return parts[parts.length - 1] || configFile;
}

/**
 * Path under ci-operator/config/ for GitHub links.
 * Bare multiarch filenames default to openshift/multiarch/.
 */
export function configRepoPath(configFile: string): string {
  if (configFile.includes("/")) return configFile;
  return `openshift/multiarch/${configFile}`;
}

/** Extract ci-operator variant from generated config filename. */
export function variantFromConfigFile(configFile: string): string {
  const base = configBasename(configFile);
  const m = base.match(/^(.+)__(.+)\.ya?ml$/);
  if (m) return m[2];
  const n = base.match(/nightly-[\d.]+(?:-upgrade-from-(?:nightly|stable)-[\d.]+)?/);
  return n ? n[0] : base.replace(/\.ya?ml$/, "");
}

/** Full Prow periodic job name from config basename + test `as:` name. */
export function periodicJobName(configFile: string, testName: string): string {
  const base = configBasename(configFile);
  const m = base.match(/^(.+)__(.+)\.ya?ml$/);
  if (m) {
    return `periodic-ci-${m[1]}-${m[2]}-${testName}`;
  }
  // Legacy multiarch-only fallback.
  const variant = variantFromConfigFile(configFile);
  return `periodic-ci-openshift-multiarch-main-${variant}-${testName}`;
}

export function configGithubUrl(configFile: string): string {
  return `${GITHUB_CONFIG_ROOT}/${configRepoPath(configFile)}`;
}

/** Always-valid history page (no build id required). */
export function prowJobHistoryUrl(configFile: string, testName: string): string {
  return `${PROW_LOGS}/${periodicJobName(configFile, testName)}`;
}

/** Deck search / job list for this periodic. */
export function prowDeckSearchUrl(configFile: string, testName: string): string {
  const job = periodicJobName(configFile, testName);
  return `${PROW_DECK}/?job=${encodeURIComponent(job)}`;
}

/**
 * Specific build view — only use with a real Prow build id from Deck/GCS.
 * Mock ids will 404; prefer job-history for mock mode.
 */
export function prowBuildViewUrl(periodicName: string, buildId: string): string {
  return `https://prow.ci.openshift.org/view/gs/test-platform-results/logs/${periodicName}/${buildId}`;
}

export function sippyJobUrl(ocpVersion: string, configFile: string, testName: string): string {
  const job = periodicJobName(configFile, testName);
  return `${SIPPY}/jobs/${encodeURIComponent(ocpVersion)}/runs?job=${encodeURIComponent(job)}`;
}

export function sippyReleaseUrl(ocpVersion: string): string {
  return `${SIPPY}/jobs/${encodeURIComponent(ocpVersion)}`;
}

/** TestGrid often groups by release informing/blocking dashboards; deep link via search. */
export function testgridSearchUrl(configFile: string, testName: string): string {
  const job = periodicJobName(configFile, testName);
  return `https://testgrid.k8s.io/?q=${encodeURIComponent(job)}`;
}

export interface JobLinks {
  periodicName: string;
  variant: string;
  prowHistory: string;
  prowDeck: string;
  config: string;
  sippy: string;
  testgrid: string;
}

export function buildJobLinks(
  ocpVersion: string,
  configFile: string,
  testName: string,
): JobLinks {
  const periodicName = periodicJobName(configFile, testName);
  return {
    periodicName,
    variant: variantFromConfigFile(configFile),
    prowHistory: prowJobHistoryUrl(configFile, testName),
    prowDeck: prowDeckSearchUrl(configFile, testName),
    config: configGithubUrl(configFile),
    sippy: sippyJobUrl(ocpVersion, configFile, testName),
    testgrid: testgridSearchUrl(configFile, testName),
  };
}
