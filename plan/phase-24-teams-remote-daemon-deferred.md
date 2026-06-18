

## 38. Phase 24 — Teams & Remote Daemon Deployment (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Do not start until Phases 3–23 are complete and the v1 local-mode product has shipped and stabilized through at least one maintenance sprint.
**Story points**: ~40 (preliminary — will be decomposed into sub-phases when activated)
**Branch**: `feat/teams-remote-deployment` (not yet created)
**Depends on**: Phases 0–23 complete. Hard dependencies: Phase 1 (daemon), Phase 5 (gateway), Phase 6 (streaming), Phase 12 (guardrails daemon integration), Phase 13 (metrics/release gate), Phase 18 (resilience/diagnostics), Phase 20 (ethical provider policy — must be enforced in server mode too), Phase 23 (AFT/MC/task board — shared memory depends on this). Soft dependencies: Phase 14 (ACP — WebSocket transport already stubbed), Phase 19 (Langfuse — per-user attribution in server mode).
**Unblocks**: multi-user agentsy deployment, organizational spend governance, shared team memory
**Status**: DEFERRED — design complete, implementation not started

> **Why deferred**: Server mode is a different product. Local mode (Phases 3–23) must ship, stabilize, and prove the architecture before adding the attack surface, operational burden, and multi-tenant complexity of remote deployment. AD-8 explicitly states: "Server deployment is a future goal that should inform architectural decisions but not block v1." The decisions in Phases 1, 5, 6, 14, and 18 were made with server mode in mind (transport-agnostic IPC, folder-based scoping, JWT-ready auth stubs, WebSocket transport option) — Phase 24 activates those stubs. This section documents the full design so the v1 work doesn't accidentally foreclose any of these paths.

### 38.1 Goal

Transform agentsy from a single-user local daemon into a multi-user remote-deployable team platform with:

1. **Remote daemon deployment** — the daemon runs on a server (bare metal, VM, or Docker container), not just on the user's laptop.
2. **OAuth-based client authentication** — clients (CLI, TUI, ACP editors) authenticate via an external OAuth/OIDC provider (Okta, Google, Authentik, Auth0, etc.) rather than shared secrets or Unix socket permissions.
3. **Per-user spend tracking and ROI** — every LLM call, tool invocation, and background job is attributed to a user; spend limits and ROI dashboards are per-user and per-team.
4. **Audit logging** — every agent action (prompt, tool call, guardrail decision, memory write) is logged with user attribution for compliance and incident response.
5. **Shared team memory** — teams share a memory scope (project knowledge, wiki, RAG index) while individual sessions and personal memories remain private.
6. **Docker daemon deployment** — users can run the daemon in a Docker container instead of as a background process, with `docker compose` as the supported deployment path.
7. **Turso alongside Docker Compose** — a Turso (libSQL) instance runs as a compose service for cross-device sync and multi-user shared state, alongside the daemon container.

### 38.2 Design

#### 38.2.1 Deployment topologies

Phase 24 supports three deployment topologies. All three run the same daemon code; the difference is configuration.

**Topology A — Local background process (current v1 default)**
```
User's laptop
└── agentsy daemon (Node.js background process)
    └── ~/.agentsy/agentsy.db (SQLite, local file)
    └── ~/.agentsy/daemon.sock (Unix socket, local)
```
No auth (Unix socket permissions). Single user. This is what Phases 0–23 build. Phase 24 does not change it.

**Topology B — Local Docker container (new in Phase 24)**
```
User's laptop
└── docker compose up
    ├── agentsy-daemon container (Node.js)
    │   └── /data/agentsy.db (SQLite, volume mount)
    └── (optional) turso container (libSQL)
        └── /data/turso.db (volume mount)
```
Auth: still single-user (no OAuth needed) — the Docker container exposes a localhost port or Unix socket. The benefit is isolation (the daemon doesn't run as the user's PID) and reproducibility (compose file pins versions). Turso is optional here but useful if the user wants cross-device sync.

**Topology C — Remote server, multi-user (the Teams feature)**
```
Remote server (or cloud VM)
└── docker compose up
    ├── agentsy-daemon container (Node.js)
    │   └── /data/agentsy.db (SQLite, volume mount or persistent volume)
    ├── turso container (libSQL)
    │   └── /data/turso.db (shared memory + sync)
    ├── (optional) caddy/nginx container (TLS termination, OAuth proxy)
    └── (optional) langfuse container (self-hosted observability)

Clients (CLI, TUI, ACP editors) connect over WSS (wss://agentsy.example.com/acp)
and authenticate via OAuth/OIDC.
```

#### 38.2.2 OAuth/OIDC authentication

The daemon's IPC layer (Phase 1, §6) is transport-agnostic. Phase 24 adds a `WebSocketTransport` (already stubbed in AD-9) and an `OAuthAuthenticator` that validates OIDC ID tokens.

**Supported providers** (pluggable, configured via `DaemonConfig.auth.providers`):

| Provider | OIDC issuer URL | Notes |
|---|---|---|
| Okta | `https://<tenant>.okta.com/oauth2/default` | Enterprise SSO |
| Google | `https://accounts.google.com` | Workspace or consumer |
| Authentik | `https://<instance>/application/o/<slug>/` | Self-hosted, open-source |
| Auth0 | `https://<tenant>.<region>.auth0.com/` | |
| Generic OIDC | any | Any provider that speaks OIDC |

**Auth flow**:

1. Client (CLI/TUI) initiates `agentsy login`. The daemon's auth service generates a PKCE challenge and redirects the user to the OAuth provider's authorization endpoint.
2. User authenticates with the provider; provider redirects back to the daemon's callback URL with an authorization code.
3. Daemon exchanges the code for an ID token + access token. Validates the ID token signature against the provider's JWKS.
4. Daemon issues a **session JWT** (signed by the daemon's own key) containing: `sub` (user ID from provider), `email`, `groups` (for team membership), `exp` (1 hour), `iat`, `scope` (agents, memory scopes).
5. Client stores the session JWT and presents it on every IPC/ACP call via `Authorization: Bearer <jwt>`.
6. Daemon validates the session JWT on every call. Refresh happens transparently when the client sees a `401` and re-runs the flow.

**Token structure** (extends the stub from Appendix D §29):

```typescript
interface SessionJWT {
  sub: string;          // User ID (from OAuth provider's `sub` claim)
  email: string;
  name: string;
  groups: string[];     // Team membership (from provider's groups claim or directory sync)
  scope: string[];      // Allowed memory scopes, agent IDs
  exp: number;          // Expiration (1 hour)
  iat: number;          // Issued at
  iss: string;          // Daemon's issuer URL
  aud: string;          // Client ID
}
```

**Authorization model**:
- **Agents** are owned by a user. Other users can't see or interact with them unless explicitly shared.
- **Memory scopes** are either `user:<userId>` (private) or `team:<teamId>` (shared). The scope key format from AD-12 (`folder:[hash]`) is extended to `user:<userId>:folder:[hash]` and `team:<teamId>:folder:[hash]`.
- **Tool execution** requires the user to have the tool in their `scope` claim. Destructive tools require per-action approval (the `ApprovalManager` from Phase 4).
- **Admin actions** (daemon shutdown, user management, spend limit changes) require `groups` to include an admin group.

#### 38.2.3 Per-user spend tracking and ROI

The existing `@agentsy/tokenomics` package (cost cache, semantic cache, ROI calculator) is per-session in v1. Phase 24 extends it to per-user and per-team aggregation.

**New tables in `UnifiedDB`**:

```sql
-- Per-user spend ledger (extends tokenomics session_ledger)
CREATE TABLE user_spend (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,                          -- NULL for personal spend
  session_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL,             -- ISO 8601
  metadata_json TEXT                     -- agent_id, task_id, etc.
);
CREATE INDEX idx_user_spend_user_date ON user_spend(user_id, recorded_at);
CREATE INDEX idx_user_spend_team_date ON user_spend(team_id, recorded_at);

-- Spend limits (per-user and per-team)
CREATE TABLE spend_limits (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,                   -- 'user:<userId>' or 'team:<teamId>'
  daily_limit_usd REAL,
  monthly_limit_usd REAL,
  enforced BOOLEAN NOT NULL DEFAULT true,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL               -- admin user ID
);

-- ROI tracking (value delivered vs cost)
CREATE TABLE roi_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,
  session_id TEXT NOT NULL,
  task_description TEXT,                 -- what the user asked for
  cost_usd REAL NOT NULL,                -- total session cost
  time_saved_minutes REAL,              -- user-reported or heuristic
  estimated_value_usd REAL,             -- user-reported or heuristic
  outcome TEXT,                         -- 'completed' | 'partial' | 'failed' | 'abandoned'
  recorded_at TEXT NOT NULL
);
```

**Spend enforcement**: the `RoutingService` (Phase 5) checks `spend_limits` before each LLM call. If the user or team has exceeded their daily/monthly limit, the call is rejected with a `spend-limit-exceeded` error. The user sees their current spend and limit in the CLI prompt (`agentsy chat` shows `[user: $2.34/$10.00 daily]`).

**ROI dashboards**: `agentsy team spend --user <id> --period month` and `agentsy team roi --team <id> --period quarter` produce reports. The daemon exposes a REST API (`/api/v1/spend`, `/api/v1/roi`) for integration with external dashboards (Grafana, Metabase).

#### 38.2.4 Audit logging

Every agent action is logged with user attribution. Extends the `GuardrailDecisionReceipt` (Phase 4) and the daemon's existing logging.

**New table**:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,               -- ISO 8601
  user_id TEXT NOT NULL,
  team_id TEXT,
  session_id TEXT NOT NULL,
  action TEXT NOT NULL,                  -- 'prompt' | 'tool_call' | 'guardrail_decision' | 'memory_write' | 'agent_spawn' | 'admin'
  agent_id TEXT,
  tool_name TEXT,
  details_json TEXT,                     -- action-specific payload
  ip_address TEXT,                       -- client IP (server mode only)
  user_agent TEXT
);
CREATE INDEX idx_audit_user_date ON audit_log(user_id, timestamp);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp);
```

**Audit events**:
- Every prompt submitted (`action: 'prompt'`)
- Every tool call (`action: 'tool_call'`, `tool_name`, `details_json: { args, result_summary }`)
- Every guardrail decision (`action: 'guardrail_decision'`, `details_json: { receipt }`)
- Every memory write (`action: 'memory_write'`, `details_json: { scope, kind, content_hash }`)
- Every agent spawn (`action: 'agent_spawn'`, `details_json: { parent_agent_id, spec }`)
- Every admin action (`action: 'admin'`, `details_json: { command, target }`)

**Retention**: 90 days by default, configurable. Export to S3/external archive via a background job.

**Privacy**: audit logs are visible to the user themselves and to team admins. The daemon's `redactionPolicy` (Phase 4) applies to `details_json` before persistence — PII and secrets are scrubbed.

#### 38.2.5 Shared team memory

Memory scopes become multi-tenant. The `ScopeManager` (Phase 1, AD-12) is extended:

```typescript
// Extended scope key format
type ScopeKey =
  | `user:${userId}:folder:${hash}`      // Personal — only the user can read/write
  | `team:${teamId}:folder:${hash}`      // Shared — all team members can read, only members can write
  | `team:${teamId}:global`              // Team-wide knowledge (not folder-scoped)
  | `user:${userId}:personal`;           // User's personal notes (not project-scoped)
```

**Shared memory semantics**:
- **Team wiki**: a team's `WikiManager` (Phase 23) writes to `team:<teamId>:folder:<hash>`. All team members read from it. Writes are attributed to the user in the wiki page metadata.
- **Team RAG index**: the `RetrievalService` (Phase 7) indexes team-shared memories into a shared vector index. Personal memories are indexed separately and only retrieved for the owning user.
- **Personal memories**: `user:<userId>:personal` is private. Other users (including admins) cannot read it. This is enforced at the `MemoryEngine.recall()` layer, not just at the API layer.
- **Conflict resolution**: when two users write to the same team memory concurrently, the bidirectional sync (Phase 23 Gap 1) uses last-write-wins on `updated_at`, with a conflict log for review.

**Turso sync**: the existing `packages/memory/src/sync/` module (Turso sync engine, conflict resolution, backup manager) is activated in server mode. The Turso instance (compose service) is the primary sync target; each daemon instance (if running multiple for HA) syncs to it. For single-daemon deployments, Turso is optional but recommended for backup and cross-device access.

#### 38.2.6 Docker daemon deployment

**Dockerfile** (`docker/daemon.Dockerfile`):
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY packages/ ./packages/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --filter @agentsy/daemon...
RUN pnpm --filter @agentsy/daemon build
EXPOSE 9380 9381
VOLUME ["/data"]
ENV AGENTSY_DATABASE_PATH=/data/agentsy.db
ENV AGENTSY_IPC_SOCKET_PATH=/data/daemon.sock
CMD ["node", "packages/daemon/dist/cli.js", "start"]
```

**Docker Compose — Topology B (local Docker)** (`docker-compose.local.yml`):
```yaml
services:
  agentsy:
    build:
      context: .
      dockerfile: docker/daemon.Dockerfile
    volumes:
      - agentsy-data:/data
      - ./projects:/workspace    # Mount project folders here
    ports:
      - "9380:9380"              # ACP WebSocket (localhost only)
    environment:
      - AGENTSY_AUTH_MODE=local  # No OAuth; localhost trusted
    restart: unless-stopped

  # Optional: Turso for cross-device sync
  turso:
    image: ghcr.io/tursodatabase/turso:latest
    volumes:
      - turso-data:/data
    environment:
      - TURSO_DB_PATH=/data/turso.db
    restart: unless-stopped

volumes:
  agentsy-data:
  turso-data:
```

**Docker Compose — Topology C (remote server, Teams)** (`docker-compose.teams.yml`):
```yaml
services:
  agentsy:
    build:
      context: .
      dockerfile: docker/daemon.Dockerfile
    volumes:
      - agentsy-data:/data
    ports:
      - "127.0.0.1:9380:9380"    # Behind Caddy, not directly exposed
    environment:
      - AGENTSY_AUTH_MODE=oauth
      - AGENTSY_OAUTH_PROVIDER=okta        # okta | google | authentik | auth0 | oidc
      - AGENTSY_OAUTH_ISSUER=${OAUTH_ISSUER}
      - AGENTSY_OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}
      - AGENTSY_OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
      - AGENTSY_OAUTH_REDIRECT_URL=https://agentsy.example.com/callback
      - AGENTSY_TURSO_URL=turso:8080
      - AGENTSY_TURSO_TOKEN=${TURSO_TOKEN}
      - AGENTSY Langfuse vars (if using Langfuse)
    depends_on:
      - turso
    restart: unless-stopped

  turso:
    image: ghcr.io/tursodatabase/turso:latest
    volumes:
      - turso-data:/data
    environment:
      - TURSO_DB_PATH=/data/turso.db
      - TURSO_AUTH_TOKEN=${TURSO_TOKEN}
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - agentsy
    restart: unless-stopped

  # Optional: self-hosted Langfuse
  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://langfuse:langfuse@postgres:5432/langfuse
      - NEXTAUTH_SECRET=${LANGFUSE_NEXTAUTH_SECRET}
      - SALT=${LANGFUSE_SALT}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=langfuse
      - POSTGRES_USER=langfuse
      - POSTGRES_PASSWORD=langfuse
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  agentsy-data:
  turso-data:
  caddy-data:
  caddy-config:
  postgres-data:
```

**Caddyfile** (TLS termination + OAuth proxy):
```
agentsy.example.com {
    reverse_proxy agentsy:9380
    # Optional: Caddy can also handle OAuth at the proxy layer
    # via forward_auth, but the daemon's built-in OAuth is preferred
    # for finer-grained scope enforcement.
}
```

#### 38.2.7 DaemonConfig extensions

```typescript
// Add to DaemonConfigSchema
auth: z.object({
  mode: z.enum(['local', 'oauth']).default('local'),
  oauth: z.object({
    provider: z.enum(['okta', 'google', 'authentik', 'auth0', 'oidc']).optional(),
    issuer: z.string().url().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUrl: z.string().url().optional(),
    scopes: z.array(z.string()).default(['openid', 'email', 'profile', 'groups']),
    sessionTtlMinutes: z.number().int().positive().default(60),
  }).default({}),
  adminGroups: z.array(z.string()).default([]),     // Groups that can run admin commands
}).default({ mode: 'local' }),

teams: z.object({
  enabled: z.boolean().default(false),
  defaultTeamId: z.string().optional(),
  sharedMemoryScopes: z.array(z.string()).default([]),
}).default({ enabled: false }),

spend: z.object({
  trackingEnabled: z.boolean().default(true),
  enforcementEnabled: z.boolean().default(false),   // Start with tracking only
  defaultDailyLimitUsd: z.number().positive().optional(),
  defaultMonthlyLimitUsd: z.number().positive().optional(),
}).default({}),

audit: z.object({
  enabled: z.boolean().default(true),
  retentionDays: z.number().int().positive().default(90),
  exportToS3: z.object({
    bucket: z.string().optional(),
    prefix: z.string().optional(),
  }).optional(),
}).default({}),

turso: z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
  authToken: z.string().optional(),
  syncIntervalMs: z.number().int().positive().default(60_000),
}).default({}),
```

#### 38.2.8 CLI extensions

- `agentsy login` — initiate OAuth flow (server mode).
- `agentsy logout` — revoke session.
- `agentsy team spend [--user <id>] [--period day|week|month]` — view spend report.
- `agentsy team roi [--team <id>] [--period quarter]` — view ROI report.
- `agentsy team users` — list team members (admin).
- `agentsy team limits set --user <id> --daily <usd>` — set spend limit (admin).
- `agentsy audit query --user <id> --action tool_call --since 2026-06-01` — query audit log (admin).
- `agentsy deploy init --topology local-docker|teams` — generate docker-compose file + Caddyfile.
- `agentsy deploy up` / `agentsy deploy down` — wrap `docker compose up/down` with agentsy-specific checks.

### 38.3 Sub-phase decomposition (when activated)

When Phase 24 is activated (post-v1), decompose into:

| Sub-phase | Scope | SP |
|---|---|---|
| 24.1 | Docker daemon + local Docker Compose (Topology B) | 5 |
| 24.2 | OAuth/OIDC authentication + session JWT | 8 |
| 24.3 | Per-user spend tracking + enforcement | 5 |
| 24.4 | Audit logging + retention/export | 4 |
| 24.5 | Shared team memory + multi-tenant ScopeManager | 6 |
| 24.6 | Turso Compose integration + sync activation | 4 |
| 24.7 | Remote server Compose (Topology C) + Caddy + TLS | 4 |
| 24.8 | CLI extensions (login, team, audit, deploy) | 4 |
| | **Total** | **~40 SP** |

### 38.4 What v1 (Phases 3–23) must NOT foreclose

To keep Phase 24 viable, the v1 work must respect these constraints:

1. **IPC transport must stay transport-agnostic.** The `IPCServer` (Phase 1) must not hardcode Unix sockets. The `IPCTransport` abstraction (already in the design) must support a `WebSocketTransport` implementation in the future. **Status: respected — AD-9 specifies this.**

2. **ACP server must support WebSocket transport.** The `ACPServer` (Phase 14) must not be stdio-only. The `transport: 'stdio' | 'websocket'` config option must be honored. **Status: respected — Phase 14 config already has this.**

3. **Memory scopes must be extensible to multi-tenant.** The `ScopeManager` (Phase 1, AD-12) uses `folder:[hash]`. Phase 24 extends this to `user:<userId>:folder:[hash]` and `team:<teamId>:folder:[hash]`. The v1 code must not assume the scope key starts with `folder:`. **Status: respected — the scope key is an opaque string.**

4. **Tokenomics must attribute to a session, not a process.** The `session_ledger` (Phase 1) already has `session_id`. Phase 24 adds `user_id` and `team_id` columns. The v1 code must not assume a single user. **Status: respected — the ledger is session-scoped.**

5. **Guardrail receipts must be attributable.** The `GuardrailDecisionReceipt` (Phase 4) has `sessionId` and `correlationId`. Phase 24 adds `userId` to the receipt. **Status: respected — the receipt is session-scoped.**

6. **The daemon must not assume it's the only writer to `UnifiedDB`.** In a multi-daemon HA setup (future), two daemon instances might write to the same Turso-backed database. The v1 schema must use `updated_at` columns and avoid destructive updates where possible. **Status: respected — all tables have `updated_at`.**

7. **The ethical provider policy (Phase 20) must be enforced in server mode too.** A team admin cannot override the xAI block or the style-mimicry block for their team. These are framework-level commitments, not team preferences. The warn-list acknowledgement becomes per-user-per-session (each team member must acknowledge individually). **Status: respected — Phase 20's policy is enforced at the `RoutingService` layer, which is daemon-owned.**

### 38.5 Out of scope for Phase 24

- **High availability (multi-daemon)** — running multiple daemon instances behind a load balancer with shared state. Requires distributed locking (Honker's locks could work) and is a follow-up to Phase 24.
- **Marketplace / billing** — charging for agentsy as a service. Phase 24 tracks spend but does not integrate with Stripe or any payment processor.
- **SSO via SAML** — SAML is more complex than OIDC and most modern providers support OIDC. SAML support is a follow-up if enterprise customers demand it.
- **Granular RBAC** — Phase 24 uses group-based authorization (admin group vs. regular users). Fine-grained role-based access (e.g. "can use `run_command` but not `delete_file`") is a follow-up.
- **Per-agent sandboxing in server mode** — the sandbox (Phase 18) runs in the daemon's context. True per-user filesystem isolation in server mode requires container-per-user or namespace isolation, which is a follow-up.

### 38.6 Verification (when activated)

- [ ] `agentsy deploy init --topology local-docker` generates a working `docker-compose.local.yml`
- [ ] `agentsy deploy init --topology teams` generates `docker-compose.teams.yml` + `Caddyfile` + `.env.example`
- [ ] `docker compose up` starts the daemon in a container with a volume-mounted SQLite DB
- [ ] `agentsy login` initiates OAuth flow and returns a session JWT
- [ ] Session JWT validated on every IPC/ACP call
- [ ] Session JWT expires after `sessionTtlMinutes` and client re-authenticates
- [ ] Per-user spend tracked in `user_spend` table
- [ ] Spend limit enforced — call rejected when limit exceeded
- [ ] `agentsy team spend --user <id> --period month` produces correct report
- [ ] `agentsy team roi --team <id> --period quarter` produces correct report
- [ ] Audit log records every prompt, tool call, guardrail decision, memory write, agent spawn, admin action
- [ ] Audit log redacts PII/secrets before persistence
- [ ] `agentsy audit query` returns filtered results (admin only)
- [ ] Shared team memory: team members can read `team:<teamId>:folder:<hash>` scope
- [ ] Personal memory: `user:<userId>:personal` is not readable by other users or admins
- [ ] Turso Compose service syncs with daemon's `UnifiedDB`
- [ ] Conflict resolution (last-write-wins) logged for review
- [ ] OAuth works with Okta, Google, Authentik, Auth0 (tested with at least 2)
- [ ] xAI block and style-mimicry block enforced in server mode (Phase 20 policy applies)
- [ ] Warn-list acknowledgement is per-user-per-session (each team member acknowledges individually)
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 38.7 Risk register (Phase 24 specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OAuth provider changes API or JWKS endpoint | Medium | High | Cache JWKS with TTL; fall back to previous keys for a grace period. Pin provider SDK versions. |
| Multi-tenant memory leak (user A sees user B's data) | Low | Critical | Enforce scope at `MemoryEngine.recall()` layer, not just API layer. Integration test: user A cannot read user B's personal scope. Pen-test before launch. |
| Spend tracking drift (recorded cost ≠ provider invoice) | Medium | Medium | Reconcile daily against provider APIs (OpenAI usage endpoint, etc.). Log discrepancies. |
| Audit log grows unbounded | High | Low | 90-day retention default; background job archives to S3. Configurable retention. |
| Docker image missing native deps (Honker extension, better-sqlite3) | Medium | High | Multi-stage build with platform-specific native deps. Test on linux/amd64 and linux/arm64. Fallback to pure-JS Honker. |
| Turso sync conflicts corrupt shared memory | Medium | High | Conflict resolution log (Phase 23). `agentsy memory reconcile` CLI command. Backup before sync. |
| Server-mode daemon has different behavior than local-mode | Medium | Medium | Same code path, different config. Integration test matrix: local-socket, local-docker, remote-oauth. |
| Admin abuse (admin reads user's personal memory) | Medium | High | Personal memory (`user:<userId>:personal`) is encrypted at rest with a user-derived key. Admins can delete but not read. Document this clearly. |

---

