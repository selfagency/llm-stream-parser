import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const DEFAULT_RELEASE_STATE = 'bootstrap-required';

/**
 * @param {string} releaseStatePath
 * @returns {{defaultState: string, packages: Record<string, string>}}
 */
export function readReleaseState(releaseStatePath: string) {
  if (!existsSync(releaseStatePath)) {
    return { defaultState: DEFAULT_RELEASE_STATE, packages: {} };
  }

  let raw: { defaultState?: string; packages?: Record<string, string> } | undefined;
  try {
    raw = JSON.parse(readFileSync(releaseStatePath, 'utf-8')) as {
      defaultState?: string;
      packages?: Record<string, string>;
    };
  } catch {
    return { defaultState: DEFAULT_RELEASE_STATE, packages: {} };
  }
  const defaultState =
    raw && typeof raw === 'object' && typeof raw.defaultState === 'string' ? raw.defaultState : DEFAULT_RELEASE_STATE;
  const packages =
    raw && typeof raw === 'object' && raw.packages && typeof raw.packages === 'object' && !Array.isArray(raw.packages)
      ? raw.packages
      : {};

  return { defaultState, packages };
}

/**
 * @param {{defaultState: string, packages: Record<string, string>}} state
 * @param {string} packageName
 * @returns {string}
 */
export function getPackageReleaseState(
  state: { defaultState: string; packages: Record<string, string> },
  packageName: string
): string {
  return state.packages[packageName] ?? state.defaultState;
}

/**
 * @param {string} releaseStatePath
 * @param {{defaultState: string, packages: Record<string, string>}} state
 */
export function writeReleaseState(
  releaseStatePath: string,
  state: { defaultState: string; packages: Record<string, string> }
) {
  const sortedPackages = Object.fromEntries(Object.entries(state.packages).toSorted(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    releaseStatePath,
    `${JSON.stringify({ defaultState: state.defaultState, packages: sortedPackages }, null, 2)}\n`
  );
}
