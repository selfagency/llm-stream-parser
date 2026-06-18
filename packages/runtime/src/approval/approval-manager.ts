/**
 * A pending approval request awaiting user confirmation.
 *
 * @internal
 */
export interface PendingApproval {
  approvalId: string;
  args: unknown;
  resolve: (approved: boolean) => void;
  startedAt: number;
  timeout: number;
  toolName: string;
}

/**
 * Options for the ApprovalManager.
 */
export interface ApprovalManagerOptions {
  /** How long (ms) to wait for user approval before auto-denying. */
  approvalTimeout?: number;
  /** Callback fired when a new approval request is pending. */
  onPending?: (approval: { approvalId: string; toolName: string; args: unknown; timeoutMs: number }) => void;
}

/**
 * Default timeout for approval requests (30 seconds).
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Concrete approval gate that coordinates tool-approval prompts.
 *
 * The ApprovalManager owns a queue of pending approvals and provides
 * a standard `requestApproval` interface that the runtime's approval
 * hook calls.  External consumers (CLI, UI) call `resolve` / `rejectAll`
 * to drive the queue, keeping the interactive layer decoupled from the
 * policy layer.
 *
 * @example
 * ```ts
 * const manager = new ApprovalManager();
 *
 * // Hook side: block until user decides
 * const ok = await manager.requestApproval('fs_write', { path: '/etc/passwd' });
 *
 * // CLI side: list and resolve
 * for (const p of manager.listPending()) { ... }
 * manager.resolve(pending.toolName, true);
 * ```
 */
export class ApprovalManager {
  readonly #pending: PendingApproval[] = [];
  readonly #options: {
    approvalTimeout: number;
    onPending?: (approval: { approvalId: string; toolName: string; args: unknown; timeoutMs: number }) => void;
  };
  #nextId = 0;

  constructor(options?: ApprovalManagerOptions) {
    this.#options = {
      approvalTimeout: options?.approvalTimeout ?? DEFAULT_TIMEOUT_MS
    };
    if (options?.onPending) {
      this.#options.onPending = options.onPending;
    }
  }

  /**
   * Request approval for a tool call.
   *
   * Returns a promise that resolves when an external consumer calls
   * {@link resolve} or {@link rejectAll}.  The promise auto-rejects
   * after {@link ApprovalManagerOptions.approvalTimeout} ms.
   */
  requestApproval(toolName: string, args: unknown): Promise<boolean> {
    const approvalId = `approval_${++this.#nextId}`;
    return new Promise<boolean>(resolve => {
      const entry: PendingApproval = {
        approvalId,
        args,
        resolve,
        startedAt: Date.now(),
        timeout: this.#options.approvalTimeout,
        toolName
      };
      this.#pending.push(entry);

      // Fire onPending callback
      this.#options.onPending?.({
        approvalId,
        toolName,
        args,
        timeoutMs: this.#options.approvalTimeout
      });

      // Auto-deny after timeout
      setTimeout(() => {
        const idx = this.#pending.indexOf(entry);
        if (idx !== -1) {
          this.#pending.splice(idx, 1);
          resolve(false);
        }
      }, this.#options.approvalTimeout);
    });
  }

  /**
   * List all pending approval requests.
   */
  listPending(): readonly PendingApproval[] {
    return [...this.#pending];
  }

  /**
   * Resolve a pending approval by approval ID.
   *
   * Returns `true` if a matching pending request was resolved.
   */
  resolve(approvalId: string, approved: boolean): boolean {
    const idx = this.#pending.findIndex(p => p.approvalId === approvalId);
    if (idx === -1) {
      return false;
    }
    const [entry] = this.#pending.splice(idx, 1);
    if (entry) {
      entry.resolve(approved);
    }
    return true;
  }

  /**
   * Reject all pending approval requests.
   */
  rejectAll(): void {
    while (this.#pending.length > 0) {
      const entry = this.#pending.shift();
      if (entry) {
        entry.resolve(false);
      }
    }
  }

  /**
   * The number of pending approval requests.
   */
  get pendingCount(): number {
    return this.#pending.length;
  }
}
