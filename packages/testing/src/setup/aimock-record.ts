// fallow-ignore-file unused-file — loaded by vitest globalSetup, not imported
/**
 * AIMock record/replay global setup.
 *
 * When AIMOCK_RECORD=true, configures LLMock to proxy to real providers
 * and save fixture files to packages/testing/src/fixtures/provider-responses/.
 *
 * @see plan/phase-33-aimock-full-integration.md §33.3.5
 */

export function setup(): void {
  if (process.env.AIMOCK_RECORD === 'true') {
    process.env.AIMOCK_FIXTURE_DIR = './src/fixtures/provider-responses';
    console.log('[aimock-record] Recording enabled — fixtures will be saved to', process.env.AIMOCK_FIXTURE_DIR);
  }
}

export function teardown(): void {
  if (process.env.AIMOCK_RECORD === 'true') {
    console.log('[aimock-record] Recording complete.');
  }
}
