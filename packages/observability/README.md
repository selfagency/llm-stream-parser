# @agentsy/observability

Observability helpers for logs, metrics, and tracing integration. Built on OpenTelemetry with first-class Langfuse support.

## Status

Internal package; surface area is intentionally minimal for now.

## Langfuse Integration

The daemon automatically wires a Langfuse exporter when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are present in the environment or a `.env` file.

### Env-var Reference

| Env var | Required | Default | Purpose |
|---------|----------|---------|---------|
| `LANGFUSE_PUBLIC_KEY` | ✅ | — | Public key (Basic auth username) |
| `LANGFUSE_SECRET_KEY` | ✅ | — | Secret key (Basic auth password) |
| `LANGFUSE_HOST` | optional | `https://cloud.langfuse.com` | Self-hosted instance root; OTLP path appended automatically |
| `LANGFUSE_PROJECT_ID` | optional | — | Sent as `X-Langfuse-Project` header |
| `LANGFUSE_FLUSH_INTERVAL_MS` | optional | `5000` | Flush interval in ms |
| `LANGFUSE_MAX_BATCH_SIZE` | optional | `64` | Max batch size before forced flush |

### Quick Start

1. Set env vars:

```bash
export LANGFUSE_PUBLIC_KEY="pk-..."
export LANGFUSE_SECRET_KEY="sk-..."
```

2. Start the daemon:

```bash
agentsy daemon start
```

3. Check observability status:

```bash
agentsy status
```

Expected startup log:

```
[daemon] observability: langfuse enabled — Loaded from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY; endpoint=https://cloud.langfuse.com/api/public/otlp/v1/traces
```

### Disabling Langfuse

To disable Langfuse even when env vars are present, set in config:

```yaml
observability:
  langfuse:
    enabled: false
```

Expected startup log:

```
[daemon] observability: langfuse disabled — Disabled by config (langfuseEnabled = false)
```

### `.env` File Loading

The daemon loads `.env.local` (highest priority) then `.env` at startup using Node 22's native `process.loadEnvFile()`. Existing `process.env` values are never overridden. Missing files are silent.

### Programmatic Usage

```typescript
import { createObservabilityFromEnv } from '@agentsy/observability';

const { engine, sinks } = createObservabilityFromEnv({
  serviceName: 'my-service',
  serviceVersion: '1.0.0'
});

// sinks[0].enabled === true when Langfuse is configured
// sinks[0].enabled === false when env vars are absent
```

### Redaction Caveat

The redaction pipeline is not yet wired into the Langfuse exporter. Until that lands, treat the Langfuse dashboard as potentially containing raw prompt content. See the v2.3 remediation plan for tracking.

## API

### `createObservabilityFromEnv(options?)`

Creates an observability engine with Langfuse sink auto-detected from environment variables.

**Returns**: `{ engine: ObservabilityEngine, sinks: Array<{ type, enabled, reason }> }`

### `detectLangfuseFromEnv(env?)`

Pure detection — checks whether Langfuse is configured in the environment.

**Returns**: `{ enabled: boolean, endpoint: string, reason: string, projectId?, flushIntervalMs?, maxBatchSize? }`

### `createLangfuseExporterFromEnv(options?, env?)`

Constructs a `LangfuseExporter` or returns `null` when not configured.

**Returns**: `LangfuseExporter | null`
