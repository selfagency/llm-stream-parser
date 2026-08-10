/**
 * Permission Relay Translator — relays permission requests from agent
 * to editor client and back.
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export interface PermissionRequest {
  approved: boolean | null;
  readonly id: string;
  readonly permission: string;
  readonly reason: string;
}

export class PermissionRelayTranslator implements Translator<PermissionRequest> {
  readonly name = 'permission-relay';
  readonly #pendingRequests = new Map<string, PermissionRequest>();
  readonly #supportedKinds = new Set<string>([
    'file_write',
    'file_read',
    'command_exec',
    'network_access',
    'agent_spawn',
    'tool_execute'
  ]);

  /** Create a new permission request. */
  requestPermission(permission: string, reason: string): PermissionRequest {
    const id = `perm_${this.#pendingRequests.size + 1}`;
    const request: PermissionRequest = { id, permission, reason, approved: null };
    this.#pendingRequests.set(id, request);
    return request;
  }

  /** Approve or deny a pending request. */
  resolvePermission(id: string, approved: boolean): boolean {
    const request = this.#pendingRequests.get(id);
    if (!request) {
      return false;
    }
    request.approved = approved;
    this.#pendingRequests.delete(id);
    return true;
  }

  /** Probe which permission kinds the client supports. */
  probeSupportedKinds(): string[] {
    return Array.from(this.#supportedKinds);
  }

  translate(_context: TranslatorContext): TranslatorResult<PermissionRequest> {
    // Return all pending requests for this context
    const pending = Array.from(this.#pendingRequests.values()).filter(r => r.approved === null);
    if (pending.length === 0) {
      return { success: true };
    }
    return { success: true, data: pending[0] as PermissionRequest };
  }
}
