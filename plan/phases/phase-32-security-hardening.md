## Phase 32 — Security Hardening: Shell Sandbox, IPC Auth, Approval IPC, Worker Path Fix

**Priority**: P0 — Sprints 4–5 (parallel with Phase 9)
**Story points**: 6
**Branch**: `fix/security-hardening`
**Depends on**: Phase 1 ✅ (daemon, SubprocessManager), Phase 3 ✅ (hook registry)
**Unblocks**: Phase 12 (Guardrails Daemon Integration — IPC auth must be in place before guardrail hooks are wired), Phase 21 (Docker tooling — sandbox must exist first)

> **Source**: 2026-06-17 code audit. Four security gaps identified in production code.

---

### 32.1 Gap 1 — Shell Tool Uses `execSync` Without Sandbox

**Severity**: CRITICAL
**File**: `packages/tools/src/tools/shell/index.ts`
**Finding**: `handleShellExec()` calls `execSync(command, { encoding, timeout, cwd, maxBuffer })` directly.
`node:child_process.execSync` is a blocking call with no process isolation. It runs in the parent
process address space, inherits all environment variables, has unrestricted filesystem access, and
cannot be killed without SIGKILL to the entire daemon.

The `VirtualSandbox` (`runtime/src/sandbox/virtual/virtual-sandbox.ts`) exists and uses Worker
Threads for isolation, but is **not wired** to the shell tool. The REPL tool (`tools/repl/index.ts`)
uses `node:vm` (documented as not a security boundary) with a `requiresApproval: true` gate. The
shell tool uses no sandbox at all.

**Fix**:

```typescript
// packages/tools/src/tools/shell/index.ts — REPLACE execSync with VirtualSandbox

import { createVirtualSandbox } from '@agentsy/runtime';

// Build sandbox once (module level — worker is reused)
const sandbox = createVirtualSandbox();

async function handleShellExec(input: Record<string, unknown>): Promise<ToolResult> {
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command) {
    return { ok: false, data: null, error: 'Missing required parameter: command' };
  }
  const timeout = typeof input.timeout === 'number' ? input.timeout : 30_000;
  const cwd = typeof input.workdir === 'string' ? input.workdir : undefined;

  // Wrap as shell invocation inside the worker-thread sandbox
  const shellCode = `
    const { execSync } = require('child_process');
    execSync(${JSON.stringify(command)}, {
      encoding: 'utf-8', cwd: ${JSON.stringify(cwd ?? process.cwd())},
      timeout: ${timeout}, maxBuffer: 10 * 1024 * 1024
    });
  `;

  const result = await sandbox.execute({ code: shellCode, timeoutMs: timeout });
  if (result.status === 'timeout') {
    return { ok: false, data: null, error: `shell_exec timed out after ${timeout}ms` };
  }
  if (result.status === 'blocked') {
    return { ok: false, data: null, error: 'shell_exec blocked by sandbox policy' };
  }
  return {
    ok: result.status === 'ok',
    data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 }
  };
}
```

> **Note**: The `VirtualSandbox` uses `node:worker_threads`, which provides OS-level process
> boundary isolation (separate heap, separate module graph). This is substantially stronger than
> `node:vm` but is not a full container (same kernel, same filesystem mounts). Phase 21 (Docker
> tooling) adds the container boundary for high-risk commands.

**Additional hardening** (same PR):
- Add `allowlist?: string[]` to `shell_exec` parameters — blocks any command not in the list
- Add `denylist: string[]` default: `['rm -rf', 'dd ', 'mkfs', ':(){ :|: & };:']`
- Log every `shell_exec` invocation to `UnifiedDB.tool_audit_*`

---

### 32.2 Gap 2 — IPC Server Has No Authentication

**Severity**: HIGH
**File**: `packages/daemon/src/ipc/server.ts`
**Finding**: The Unix socket is `chmod 0o600` (owner-only file permissions), which is good. However,
there is no protocol-level authentication. Any process running as the **same OS user** (including
malicious code injected into a browser extension, editor plugin, or npm package) can:
- Issue `daemon.shutdown` — crash the daemon
- Issue `agent.spawn` with arbitrary config — spawn agents
- Issue `process.spawn` — execute arbitrary commands (even with SubprocessSpecSchema validation, the
  allowable command surface is large)

**Fix**: Add a per-connection challenge/response using a session token stored in the socket file's
sibling directory:

```typescript
// packages/daemon/src/ipc/auth.ts (NEW)

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN_PATH_SUFFIX = '.auth_token';

export function generateDaemonToken(socketPath: string): string {
  const token = randomBytes(32).toString('hex');
  writeFileSync(socketPath + TOKEN_PATH_SUFFIX, token, { mode: 0o600 });
  return token;
}

export function loadDaemonToken(socketPath: string): string {
  return readFileSync(socketPath + TOKEN_PATH_SUFFIX, 'utf-8').trim();
}

export function verifyClientHandshake(
  nonce: string,
  clientHmac: string,
  token: string
): boolean {
  const expected = createHmac('sha256', token).update(nonce).digest('hex');
  return expected === clientHmac;
}
```

**Handshake protocol** (added to `IPCMethod` registry):

```
Client connects →
Server sends: { method: "auth.challenge", params: { nonce: "<32-byte-hex>" } }
Client sends: { method: "auth.respond", params: { hmac: HMAC-SHA256(token, nonce) } }
Server validates → if OK, marks clientId as authenticated
All subsequent requests from unauthenticated clients → -32001 Unauthorized
```

**Unauthenticated allow-list** (methods that don't require auth):
- `auth.respond` (obviously)
- `daemon.status` (read-only health check, safe to expose)

**CLI client update** (`packages/daemon/src/ipc/client.ts`):
```typescript
async connectAuthenticated(socketPath: string): Promise<void> {
  await this.connect(socketPath);
  const token = loadDaemonToken(socketPath);
  const challenge = await this.waitForChallenge();
  const hmac = createHmac('sha256', token).update(challenge.nonce).digest('hex');
  await this.request('auth.respond', { hmac });
}
```

**Authorisation levels** (phase-appropriate — full RBAC in Phase 24):
- Level 0: Unauthenticated — `auth.respond`, `daemon.status` only
- Level 1: Authenticated — all current methods
- Level 2: Admin (future Phase 24) — `daemon.shutdown`, `process.spawn`

---

### 32.3 Gap 3 — `ApprovalManager` Has No IPC Surface

**Severity**: HIGH
**Files**: `packages/runtime/src/approval/approval-manager.ts`, `packages/daemon/src/ipc/protocol.ts`
**Finding**: `ApprovalManager.requestApproval(toolName, args)` exists and is used by the approval
hook, but there are no IPC methods to:
- Notify a CLI/TUI client that an approval is pending
- Accept or reject a pending approval

This means agents running in the Piscina pool silently time out their approval requests (30s default)
with no user interaction possible.

**Fix**: Add IPC methods and daemon handler:

```typescript
// packages/daemon/src/ipc/protocol.ts — add to IPCMethod
| 'approval.pending'    // Notification from daemon → client: approval needed
| 'approval.resolve'   // Request from client → daemon: approve/reject
| 'approval.list'      // Request: list pending approvals
```

```typescript
// packages/daemon/src/daemon.ts — add approval IPC handlers

this.ipc.handle('approval.resolve', req => {
  const parsed = z.object({
    approvalId: z.string().min(1),
    approved: z.boolean()
  }).safeParse(req);
  if (!parsed.success) {
    return Promise.reject(Object.assign(new Error('Invalid approvalId or approved'), { code: -32_602 }));
  }
  const ok = this.approvalManager.resolve(parsed.data.approvalId, parsed.data.approved);
  return Promise.resolve({ resolved: ok });
});

this.ipc.handle('approval.list', () =>
  Promise.resolve({ pending: this.approvalManager.listPending() })
);
```

**`ApprovalManager` update** — add broadcast on new request:

```typescript
async requestApproval(toolName: string, args: unknown): Promise<boolean> {
  const approvalId = randomUUID();
  // ... existing pending map logic ...

  // Broadcast to all connected IPC clients
  this.ipc.broadcast('approval.pending', {
    approvalId,
    toolName,
    args,
    timeoutMs: this.options.approvalTimeout ?? DEFAULT_TIMEOUT_MS
  });

  return result;
}
```

**CLI integration** (Phase 16 — Guardrails CLI can surface this):
```
[agentsy] Tool approval required: shell_exec
  Command: "git push origin main"
  [y/n]:
```

---

### 32.4 Gap 4 — `VirtualSandbox` `WORKER_PATH` Is Fragile

**Severity**: MEDIUM
**File**: `packages/runtime/src/sandbox/virtual/virtual-sandbox.ts`
**Finding**:
```typescript
const WORKER_PATH = join(process.cwd(), 'packages/runtime/dist/sandbox/virtual/sandbox-worker.js');
```
This path is relative to `process.cwd()` at runtime. When the daemon starts from any directory
other than the monorepo root (e.g. via `agentsy daemon start` from a project folder), the worker
file will not be found and the sandbox will throw on first use.

**Fix**: Use `import.meta.url`-based resolution, which is stable regardless of `cwd`:

```typescript
// packages/runtime/src/sandbox/virtual/virtual-sandbox.ts — REPLACE

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolves relative to the compiled output, not process.cwd()
const WORKER_PATH = join(__dirname, 'sandbox-worker.js');
```

This is a one-line fix but blocks any production use of the sandbox outside the monorepo root.

---

### 32.5 Story Point Allocation

| Gap | SP | Notes |
|---|---|---|
| Shell sandbox wiring (32.1) | 2 | VirtualSandbox already exists; just wiring + denylist |
| IPC authentication (32.2) | 2.5 | New auth.ts module + protocol change + client update |
| Approval IPC surface (32.3) | 1 | Protocol addition + broadcast wiring |
| Worker path fix (32.4) | 0.5 | One-line fix + test |
| **Total** | **6** | |

---

### 32.6 Verification

- [ ] `shell_exec("rm -rf /tmp/test")` → executes in Worker Thread, not parent process
- [ ] `shell_exec` with command not in allowlist → blocked with `{ ok: false, error: 'Command not in allowlist' }`
- [ ] IPC client without auth token → receives `-32001 Unauthorized` on any non-auth method
- [ ] `agentsy daemon start` from `/tmp/` → VirtualSandbox loads correctly (no WORKER_PATH error)
- [ ] Agent requests approval → CLI receives `approval.pending` IPC notification within 100ms
- [ ] CLI sends `approval.resolve { approved: true }` → agent's `requestApproval()` resolves `true`
- [ ] All existing tests pass — no regressions in shell, REPL, or IPC

---

### 32.7 Cross-References

| Item | Related Phase |
|---|---|
| Shell audit logging → `tool_audit_*` | Phase 1 ✅ (table already defined in UnifiedDB) |
| Full container sandbox for high-risk commands | Phase 21 (Docker tooling) |
| RBAC / admin authorization levels | Phase 24 (Teams — DEFERRED) |
| IPC auth token rotation | Phase 24 |
| Network egress policy on subprocesses | Phase 25 (MITM Proxy — DEFERRED) |
