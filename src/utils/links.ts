/**
 * OpenShift CI link builders for multiarch / IBM Z periodics.
 *
 * Periodic naming (from ci-operator-prowgen):
 *   periodic-ci-openshift-multiarch-main-<variant>-<test-as-name>
 *
 * Config files:
 *   openshift-multiarch-main__<variant>.yaml
 *   e.g. openshift-multiarch-main__nightly-5.0.yaml
 *        openshift-multiarch-main__nightly-5.0-upgrade-from-nightly-4.22.yaml
 */

const GITHUB_RELEASE_MAIN =
  "https://github.com/openshift/release/blob/main/ci-operator/config/openshift/multiarch";
const PROW_LOGS = "https://prow.ci.openshift.org/job-history/gs/test-platform-results/logs";
const PROW_DECK = "https://prow.ci.openshift.org";
const SIPPY = "https://sippy.dptools.openshift.org/sippy-ng";

/** Extract ci-operator variant from generated config filename. */
export function variantFromConfigFile(configFile: string): string {
  const m = configFile.match(/openshift-multiarch-main__(.+)\.ya?ml$/);
  if (m) return m[1];
  // Fallback: nightly-<ver>
  const n = configFile.match(/nightly-[\d.]+(?:-upgrade-from-(?:nightly|stable)-[\d.]+)?/);
  return n ? n[0] : configFile.replace(/\.ya?ml$/, "");
}

/** Full Prow periodic job name. */
export function periodicJobName(configFile: string, testName: string): string {
  const variant = variantFromConfigFile(configFile);
  return `periodic-ci-openshift-multiarch-main-${variant}-${testName}`;
}

export function configGithubUrl(configFile: string): string {
  // openshift/release default branch is main (master redirects)
  return `${GITHUB_RELEASE_MAIN}/${configFile}`;
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
  // Sippy job runs view for a release
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
