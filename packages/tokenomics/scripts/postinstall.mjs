/**
 * Postinstall script for @agentsy/tokenomics.
 *
 * Ensures tiktoken WASM bindings are correctly set up by triggering
 * tiktoken's initialization. In pnpm workspaces, the tiktoken WASM
 * file may not be properly loaded without this explicit initialization.
 */
async function main() {
  try {
    // Trigger tiktoken WASM initialization
    const tiktoken = await import('tiktoken');
    const enc = tiktoken.get_encoding('cl100k_base');
    enc.free();
    console.log('[tokenomics] tiktoken WASM initialized successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[tokenomics] tiktoken WASM initialization failed:', message);
    console.warn('[tokenomics] Tokenizer functionality will be degraded. Run `pnpm rebuild tiktoken` to fix.');
  }
}

main();
