/**
 * Postinstall script — resolve the AFT Rust binary.
 *
 * Runs after `pnpm install` to ensure the AFT binary is available.
 * Uses npx (bundled with pnpm) to invoke @cortexkit/aft doctor/setup.
 * Written as .mjs so it runs under plain `node` without bun/tsx.
 */
import { execSync } from 'node:child_process';

function safePathEnv() {
  const safePath =
    process.platform === 'win32'
      ? `${process.env.SystemDrive || 'C:'}\\Windows\\System32;${process.env.SystemDrive || 'C:'}\\Windows`
      : '/usr/bin:/bin:/usr/sbin:/sbin';
  return { ...process.env, PATH: safePath };
}

function main() {
  console.log('[postinstall:aft] Checking AFT binary…');

  try {
    execSync('npx --yes @cortexkit/aft@latest doctor', {
      // nosemgrep: command-injection-path
      // PATH restricted to safe system directories via safePathEnv().
      stdio: 'pipe',
      timeout: 15_000,
      env: { ...safePathEnv(), CI: 'true' }
    });
    console.log('[postinstall:aft] ✅ AFT binary already resolved');
  } catch {
    console.log('[postinstall:aft] Resolving AFT binary…');
    try {
      execSync('npx --yes @cortexkit/aft@latest setup', {
        // nosemgrep: command-injection-path
        // PATH restricted to safe system directories via safePathEnv().
        stdio: 'pipe',
        timeout: 30_000,
        env: { ...safePathEnv(), CI: 'true' }
      });
      console.log('[postinstall:aft] ✅ AFT binary resolved');
    } catch (setupError) {
      const message = setupError instanceof Error ? setupError.message : String(setupError);
      console.warn(`[postinstall:aft] ⚠️ AFT binary resolution: ${message}`);
      console.warn('[postinstall:aft] Run `npx @cortexkit/aft setup` manually.');
    }
  }
}

main();
