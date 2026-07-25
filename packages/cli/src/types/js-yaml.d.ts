/**
 * Minimal type declarations for js-yaml v4.
 *
 * The package is declared as a dependency in package.json but cannot
 * be installed in this session. Once `pnpm install` is run, these
 * declarations are superseded by the bundled types in node_modules/js-yaml.
 */

declare module 'js-yaml' {
  /**
   * Parse a YAML string into a JavaScript value.
   */
  export function load(input: string, options?: Record<string, unknown>): unknown;

  /**
   * Serialize a JavaScript value into a YAML string.
   */
  export function dump(input: unknown, options?: Record<string, unknown>): string;
}
