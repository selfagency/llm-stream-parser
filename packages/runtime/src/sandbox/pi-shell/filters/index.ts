/* biome-ignore-all lint: re-export barrel with filter detection */

export {
  collapseEmptyLines,
  containsAnsi,
  handleCarriageReturns,
  isProgressBarLine,
  removeProgressBars,
  stripAnsi
} from './ansi.js';
export { CargoFilter, createCargoFilter } from './cargo.js';
export { createDockerFilter, DockerFilter } from './docker.js';
export { createGitFilter, GitFilter } from './git.js';
export { createGoFilter, GoFilter } from './go.js';
export { createJvmFilter, JvmFilter } from './jvm.js';
export { createNpmFilter, NpmFilter } from './npm.js';
export { createPythonFilter, PythonFilter } from './python.js';
export type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

import { CargoFilter } from './cargo.js';
import { DockerFilter } from './docker.js';
import { GitFilter } from './git.js';
import { GoFilter } from './go.js';
import { JvmFilter } from './jvm.js';
import { NpmFilter } from './npm.js';
import { PythonFilter } from './python.js';
import type { FilterContext, OutputFilterId, ShellFilter } from './types.js';

export const ALL_FILTERS: readonly ShellFilter[] = [
  new CargoFilter(),
  new GoFilter(),
  new JvmFilter(),
  new DockerFilter(),
  new GitFilter(),
  new NpmFilter(),
  new PythonFilter()
];

export function detectFilter(context: FilterContext): OutputFilterId | null {
  for (const filter of ALL_FILTERS) {
    if (filter.detect(context)) {
      return filter.id as OutputFilterId;
    }
  }
  return null;
}

export function getFilterById(id: OutputFilterId): ShellFilter | undefined {
  for (const filter of ALL_FILTERS) {
    if (filter.id === id) {
      return filter;
    }
  }
  return undefined;
}
