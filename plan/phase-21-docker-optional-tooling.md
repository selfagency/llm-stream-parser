
## 27. Phase 21 — Docker-Based Optional Tooling

**Priority**: P2 — Sprint 4–5
**Story points**: 8
**Branch**: `feat/docker-optional-tooling`
**Depends on**: Phase 1 ✅ (daemon, `SubprocessManager`), Phase 12 (guardrails daemon integration — presidio is a PII scanner that complements the guardrails pipeline)
**Unblocks**: Phase 13 §18.7 (langeval integration — langeval runs as a Docker Compose stack that extends this phase's Docker infrastructure)

### 27.1 Goal

Add user-optional, resource-availability-dependent support for two Docker-based tools (plus the Docker infrastructure that langeval in Phase 13 §18.7 also consumes):

1. **[super-linter](https://github.com/super-linter/super-linter)** — a comprehensive multi-language linter that runs in a Docker container. Agentsy invokes it as a tool when the user wants a full-repo lint pass with 60+ supported languages.
2. **[Presidio](https://github.com/microsoft/presidio)** — Microsoft's PII detection and anonymization toolkit. Agentsy uses it as a high-accuracy PII scanner that complements the regex-based `PIIScanner` in `@agentsy/guardrails`.

The `DockerAvailabilityChecker` and Docker Compose patterns built in this phase are reused by Phase 13 §18.7 (langeval stack) and Phase 24 (Teams Docker deployment).

Both are **opt-in** (disabled by default), **Docker-dependent** (the daemon detects whether Docker is available and whether the images are present), and **resource-aware** (the daemon checks available memory/CPU before invoking).

### 27.2 Design

#### 27.2.1 `DockerAvailabilityChecker`

```typescript
// packages/daemon/src/services/docker-availability.ts (NEW)

export interface DockerAvailability {
  readonly available: boolean;
  readonly version: string | null;
  readonly reason: string;               // 'Docker not found' | 'Docker daemon not running' | 'OK'
  readonly availableMemoryMb: number | null;
  readonly availableCpus: number | null;
}

export async function checkDockerAvailability(): Promise<DockerAvailability> {
  // 1. `docker --version` via SubprocessManager
  // 2. `docker info` to check daemon is running
  // 3. `docker system df --format json` for resource stats
  // 4. Parse /proc/meminfo or os.totalmem()/freemem() for host resources
}

export async function isImagePresent(imageName: string): Promise<boolean> {
  // `docker image inspect <imageName>` — returns true if present
}

export async function pullImage(imageName: string): Promise<boolean> {
  // `docker pull <imageName>` — returns true on success
}
```

#### 27.2.2 `SuperLinterTool`

```typescript
// packages/tools/src/tools/super-linter/index.ts (NEW)

export function createSuperLinterTool(deps: {
  subprocessManager: SubprocessManager;
  dockerChecker: DockerAvailabilityChecker;
}): ToolDefinition {
  return {
    name: 'super_lint',
    description: 'Run super-linter on the project (or a subdirectory). Requires Docker. ' +
                 'Supports 60+ languages. Slower than built-in linters but comprehensive.',
    annotations: {
      readOnlyHint: false,        // writes lint results to /tmp
      openWorldHint: false,
      // New annotation fields from Phase 14 §19.5:
      isDestructive: false,
      maxResultSizeChars: 50_000, // super-linter output can be huge — disk-spill
    },
    parameters: [
      { name: 'path', type: 'string', required: false, description: 'Subdirectory to lint (default: project root)' },
      { name: 'languages', type: 'array', required: false, description: 'Limit to specific languages' },
      { name: 'fix', type: 'boolean', required: false, description: 'Attempt auto-fix (default: false)' },
    ],
    handler: async (input) => {
      // 1. Check Docker availability
      const docker = await deps.dockerChecker.check();
      if (!docker.available) {
        return { ok: false, data: null, error: `Docker not available: ${docker.reason}` };
      }
      // 2. Check resource availability (super-linter needs ~2GB RAM)
      if (docker.availableMemoryMb && docker.availableMemoryMb < 2048) {
        return { ok: false, data: null, error: `Insufficient memory: ${docker.availableMemoryMb}MB available, 2048MB required` };
      }
      // 3. Ensure image is present (pull if missing)
      const image = 'super-linter/super-linter:latest';
      if (!(await deps.dockerChecker.isImagePresent(image))) {
        await deps.dockerChecker.pullImage(image);
      }
      // 4. Invoke via SubprocessManager
      const result = await deps.subprocessManager.spawnProcess({
        command: 'docker',
        args: ['run', '--rm', '-v', `${process.cwd()}:/tmp/lint`, image, ...buildArgs(input)],
        timeoutMs: 300_000,  // 5 min timeout
        memoryLimitMb: 2048,
      });
      // 5. Parse and return results
      return parseLintResult(result);
    },
  };
}
```

#### 27.2.3 `PresidioScanner` (guardrails integration)

```typescript
// packages/guardrails/src/scanners/presidio.ts (NEW)

export class PresidioScanner implements GuardrailScanner {
  readonly id = 'presidio';
  readonly phase: GuardrailPhase = 'input';  // Also runs on 'output' and 'egress'
  readonly priority = 35;                     // Higher priority than regex PII (runs first when available)

  constructor(private deps: {
    subprocessManager: SubprocessManager;
    dockerChecker: DockerAvailabilityChecker;
    enabled: boolean;  // From DaemonConfig.guardrails.presidio.enabled
  }) {}

  async evaluate(input: string, context: GuardrailContext): Promise<GuardrailResult> {
    if (!this.deps.enabled) return { status: 'pass', phase: 'input' };

    const docker = await this.deps.dockerChecker.check();
    if (!docker.available) {
      // Graceful degradation — fall back to regex PIIScanner (already in pipeline)
      return { status: 'pass', phase: 'input' };
    }

    // Invoke Presidio analyzer in Docker
    const result = await this.deps.subprocessManager.spawnProcess({
      command: 'docker',
      args: ['run', '--rm', '-i', 'mcr.microsoft.com/presidio-analyzer:latest', 'analyze'],
      timeoutMs: 10_000,
    });

    const detections = parsePresidioResult(result);
    if (detections.length === 0) return { status: 'pass', phase: 'input' };

    return {
      status: 'transform',
      phase: 'input',
      sanitized: redactWithPresidio(input, detections),
      transformReason: 'redaction',
      detections: detections.map(d => ({
        id: `presidio-${d.entity_type}-${d.start}`,
        severity: 'high',
        description: `PII detected: ${d.entity_type}`,
        confidence: d.score,
        start: d.start,
        end: d.end,
      })),
    };
  }
}
```

#### 27.2.4 DaemonConfig extension

```typescript
// Add to DaemonConfigSchema (Phase 16 / config.ts)
docker: z.object({
  enabled: z.boolean().default(false),  // opt-in
  superLinter: z.object({
    enabled: z.boolean().default(false),
    image: z.string().default('super-linter/super-linter:latest'),
    timeoutMs: z.number().int().positive().default(300_000),
    memoryLimitMb: z.number().int().positive().default(2048),
  }).default({}),
  presidio: z.object({
    enabled: z.boolean().default(false),
    image: z.string().default('mcr.microsoft.com/presidio-analyzer:latest'),
    timeoutMs: z.number().int().positive().default(10_000),
  }).default({}),
}).default({})
```

#### 27.2.5 Resource-availability contract

Both tools check three conditions before invoking:

1. **Docker available** — `docker --version` and `docker info` succeed.
2. **Image present** — `docker image inspect` succeeds; if not, offer to pull (interactive) or auto-pull (configurable).
3. **Resources sufficient** — host has enough free memory (super-linter: ≥2GB, presidio: ≥512MB) and CPU (≥1 core available).

If any condition fails, the tool returns a graceful degradation result (super-linter: "Docker not available, falling back to built-in linters"; presidio: "Docker not available, falling back to regex PII scanner"). No hard failures.

### 27.3 File-by-File Change List

**New** (5 files):

- `packages/daemon/src/services/docker-availability.ts` — `DockerAvailabilityChecker`
- `packages/daemon/src/services/docker-availability.test.ts`
- `packages/tools/src/tools/super-linter/index.ts` — `SuperLinterTool`
- `packages/tools/src/tools/super-linter/index.test.ts`
- `packages/guardrails/src/scanners/presidio.ts` — `PresidioScanner`

**Modified** (3 files):

- `packages/daemon/src/config.ts` — add `docker` section
- `packages/daemon/src/daemon.ts` — instantiate `DockerAvailabilityChecker`, pass to tools + guardrails
- `packages/guardrails/src/index.ts` — export `PresidioScanner`

### 27.4 Verification

- [ ] `DockerAvailabilityChecker` correctly detects Docker presence, daemon state, and resources
- [ ] `SuperLinterTool` returns graceful degradation when Docker is absent
- [ ] `SuperLinterTool` invokes `docker run` with correct args and parses output
- [ ] `PresidioScanner` returns `pass` when disabled
- [ ] `PresidioScanner` returns `pass` (graceful degradation) when Docker is absent
- [ ] `PresidioScanner` returns `transform` with redacted output when PII is detected
- [ ] `DaemonConfig.docker` schema has correct defaults (all disabled)
- [ ] Resource checks prevent invocation when memory/CPU insufficient
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
