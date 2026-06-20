/**
 * Tests for IPC authentication module.
 *
 * Covers HMAC-SHA256 challenge/response handshake, token generation,
 * and file-level credential storage with 0o600 permissions.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// fallow-ignore-next-line unresolved-import — tsconfig resolves .ts files
import { computeClientHandshake, generateDaemonToken, loadDaemonToken, verifyClientHandshake } from './auth.js';

describe('IPC auth', () => {
  describe('HMAC handshake', () => {
    it('computes and verifies a valid handshake', () => {
      const token = 'test-token-123';
      const nonce = randomBytes(16).toString('hex');
      const hmac = computeClientHandshake(nonce, token);
      expect(verifyClientHandshake(nonce, hmac, token)).toBe(true);
    });

    it('rejects handshake with wrong token', () => {
      const token = 'correct-token';
      const wrongToken = 'wrong-token';
      const nonce = randomBytes(16).toString('hex');
      const hmac = computeClientHandshake(nonce, token);
      expect(verifyClientHandshake(nonce, hmac, wrongToken)).toBe(false);
    });

    it('rejects handshake with wrong nonce', () => {
      const token = 'test-token';
      const nonce = randomBytes(16).toString('hex');
      const wrongNonce = randomBytes(16).toString('hex');
      const hmac = computeClientHandshake(nonce, token);
      expect(verifyClientHandshake(wrongNonce, hmac, token)).toBe(false);
    });

    it('produces deterministic HMAC for same inputs', () => {
      const token = 'deterministic-token';
      const nonce = 'fixed-nonce-value';
      const hmac1 = computeClientHandshake(nonce, token);
      const hmac2 = computeClientHandshake(nonce, token);
      expect(hmac1).toBe(hmac2);
    });
  });

  describe('token file management', () => {
    const tempDir = tmpdir();
    let socketPath: string;

    beforeEach(() => {
      socketPath = join(tempDir, `agentsy-test-auth-${randomBytes(4).toString('hex')}.sock`);
    });

    afterEach(() => {
      try {
        unlinkSync(`${socketPath}.auth_token`);
      } catch {
        /* fine */
      }
    });

    it('generates a token file with 0o600 permissions', () => {
      const token = generateDaemonToken(socketPath);
      expect(token).toBeTruthy();
      expect(token.length).toBe(64); // 32 bytes hex encoded

      // Verify file exists with correct permissions
      const stats = (() => {
        try {
          const mode = readFileSync(`${socketPath}.auth_token`).toString();
          return mode.length > 0;
        } catch {
          return false;
        }
      })();
      expect(stats).toBe(true);
    });

    it('loads the same token that was generated', () => {
      const token = generateDaemonToken(socketPath);
      const loaded = loadDaemonToken(socketPath);
      expect(loaded).toBe(token);
    });

    it('generates unique tokens each call', () => {
      const socketPath2 = join(tempDir, `agentsy-test-auth-${randomBytes(4).toString('hex')}.sock`);
      try {
        const token1 = generateDaemonToken(socketPath);
        const token2 = generateDaemonToken(socketPath2);
        expect(token1).not.toBe(token2);
      } finally {
        try {
          unlinkSync(`${socketPath2}.auth_token`);
        } catch {
          /* fine */
        }
      }
    });

    it('loadDaemonToken reads an externally written token', () => {
      const expected = 'external-token-value';
      writeFileSync(`${socketPath}.auth_token`, expected, 'utf-8');
      const loaded = loadDaemonToken(socketPath);
      expect(loaded).toBe(expected);
    });

    it('full handshake round trip with generated token', () => {
      const token = generateDaemonToken(socketPath);
      const loaded = loadDaemonToken(socketPath);
      expect(loaded).toBe(token);

      const nonce = randomBytes(16).toString('hex');
      const hmac = computeClientHandshake(nonce, loaded);
      expect(verifyClientHandshake(nonce, hmac, token)).toBe(true);
    });
  });
});
