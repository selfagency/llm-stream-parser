/**
 * IPC authentication — challenge/response handshake for daemon socket connections.
 *
 * Uses a shared secret token stored alongside the socket file. The client proves
 * knowledge of the token via HMAC-SHA256 without sending the token itself.
 *
 * @module
 */

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN_PATH_SUFFIX = '.auth_token';

/**
 * Generate a new daemon auth token and write it to disk.
 * The token file is created with 0o600 permissions (owner read/write only).
 */
export function generateDaemonToken(socketPath: string): string {
  const token = randomBytes(32).toString('hex');
  writeFileSync(socketPath + TOKEN_PATH_SUFFIX, token, { mode: 0o600 });
  return token;
}

/**
 * Load the daemon auth token from disk.
 */
export function loadDaemonToken(socketPath: string): string {
  return readFileSync(socketPath + TOKEN_PATH_SUFFIX, 'utf-8').trim();
}

/**
 * Verify a client's HMAC response against the expected value.
 *
 * @param nonce — The challenge nonce sent to the client.
 * @param clientHmac — The HMAC-SHA256 returned by the client.
 * @param token — The shared secret token.
 * @returns True if the HMAC matches.
 */
export function verifyClientHandshake(nonce: string, clientHmac: string, token: string): boolean {
  const expected = createHmac('sha256', token).update(nonce).digest('hex');
  return expected === clientHmac;
}

/**
 * Compute the client's HMAC response for a given nonce and token.
 */
export function computeClientHandshake(nonce: string, token: string): string {
  return createHmac('sha256', token).update(nonce).digest('hex');
}
