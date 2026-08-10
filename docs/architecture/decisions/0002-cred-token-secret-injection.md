# ADR 0002: `$CRED(...)` token secret injection architecture

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

Agent tool calls regularly need secrets — API keys, tokens, passwords — for operations such as deploying to Vercel, provisioning cloud resources, or authenticating against databases.

Without a structured secret-injection path, the agent workflow was:

1. User types or pastes a secret into a prompt
2. LLM reads the raw secret and generates tool arguments containing it
3. The guardrail pipeline detects the secret at the tool boundary (post-generation) and attempts resolution/redaction
4. The LLM's context window still contains the raw secret from step 2 — context compression shrinks it but does not remove it

This meant the raw secret propagated through the LLM context across the entire session, violating the principle of least privilege at the model-context boundary.

Separately, `@agentsy/secrets` had a `CredentialBroker` subsystem that could issue short-lived, encrypted, audited credentials from a `Keyring` backend, but there was no mechanism for tool inputs to reference secrets without exposing the raw value to the LLM.

## Decision

Agentsy will adopt a `$CRED(...)` token format that lets tool arguments and configuration values reference secrets by resource type instead of by value.

### Token format

```text
$CRED(<resourceType>[:<field>])
```

| Form | Example | Meaning |
|------|---------|---------|
| Simple | `$CRED(vercel_prod)` | Resolve the default field for `vercel_prod` |
| Field-qualified | `$CRED(database:password)` | Resolve specific field `password` on `database` |

### Resolution architecture

```text
LLM context:     shell({ cmd: "deploy --token $CRED(vercel_prod)" })
                      │
                      ▼
[Pre-tool-call hook]  ──  parse $CRED(...) tokens in tool args
                      │
                      ├── broker.issue(resourceType)  → short-lived encrypted credential
                      ├── broker.resolve(credId)      → decrypt just-in-time
                      └── args substituted with resolved value
                      │
                      ▼
Tool executes with the real secret (oblivious to token mechanism)
```

### Boundary rule

- **Token parsing and resolution** live in `@agentsy/secrets` — the `injection/` module owns `parseSecretTokens`, `resolveCredentials`, and `createCredentialResolverHook`
- **Provider backends** live in `@agentsy/secrets` — `provider/` contains the `KeyringProvider` interface, `ProviderRegistry`, 5 local CLI providers, and 6 cloud SDK providers
- **The credential lifecycle (issue/resolve/revoke/expire)** lives in `@agentsy/secrets` — `CredentialBroker` + `InMemoryKeyring` in `broker/`
- **CLI commands** (`secrets init`, `secrets list`, `secrets lookup`, `secrets sync`) live in `@agentsy/cli`
- **Integration hooks** live in `@agentsy/secrets` (not `@agentsy/runtime`) to avoid circular dependencies — the hook module is importable by any runtime integration
- **Config format** is `.agentsy/secrets.yaml` with Zod schema validation in `config/`
- **Detection and redaction** of raw secret values in tool output lives in `detection/` (pre-existing `createSecretDetectionHook`)

### Security invariants

1. The LLM never sees the raw secret — only the `$CRED(...)` token
2. Credentials are short-lived (default 300s TTL) and scoped to a session + tool call
3. Every `issue`/`resolve`/`revoke` operation is logged to an audit trail
4. Tool output is post-processed by the secret detection hook to redact any re-leaked secret patterns
5. `$CRED(...)` tokens in config files are inert without the runtime resolver — safe to commit to version control

## Alternatives considered

### Alternative A: Runtime-only injection at the shell execution layer

Inject secrets directly into tool subprocess environments without the LLM seeing any reference. Rejected because it requires the runtime to know which secrets each tool needs ahead of time, breaking the abstraction for arbitrary shell commands.

### Alternative B: In-band approach — LLM calls a `resolveSecret` tool

The LLM calls a dedicated tool to resolve a secret when needed. Rejected because it adds a round-trip per secret, exposes secret resolution timing to the LLM, and the resolved value still enters the LLM context through the tool result.

### Alternative C: Single provider interface with no registry

Rejected because real deployments use multiple secret stores (a developer may have 1Password locally while CI uses Vault). The `ProviderRegistry` with fast-path/slow-path resolution allows declarative `$CRED(...)` tokens that resolve against whichever provider is configured.

## Consequences

### Positive

- LLM context never contains raw secrets — the `$CRED(...)` token is the only representation the model sees
- `$CRED(...)` tokens in config files are safe to commit; they are inert without the runtime resolver
- The `KeyringProvider` interface is extensible — adding a new secret backend requires only implementing 5 methods (`check`, `resolve`, `list`, and optional `sync`, `name`)
- Local CLI providers (1Password, Bitwarden, Dashlane, LastPass, Apple Passwords) work without any cloud dependency
- Cloud providers (Doppler, Infisical, Vault, AWS SM, GCP SM, Azure KV) support production deployments
- Audit trail provides a complete ledger of credential access for security review
- `ProviderRegistry` supports both fast-path (declared `resourceTypes`) and slow-path (`check()` probe) resolution, allowing both simple and dynamic matching

### Negative

- Each tool call that uses `$CRED(...)` incurs a broker round-trip (issue + resolve) — latency-sensitive paths may need caching
- The token format `$CRED(...)` is a magic string that must be documented and understood by agent prompt authors
- Provider backends are best-effort: if the configured CLI is not installed or the cloud SDK is not authenticated, resolution fails at runtime
- Full `$CRED(...)` support at the runtime hook level (pre-tool-call substitution + post-tool-call redaction) requires integration into `@agentsy/runtime`'s hook pipeline

### Follow-up implications

- The pre-tool-call credential resolver hook must be wired into the runtime hook pipeline to enable automatic `$CRED(...)` substitution
- Provider health checks (`ProviderHealth` interface) should be surfaced via `agentsy doctor` for diagnosing misconfigured providers
- The `@agentsy/testing` package should include integration test fixtures for local providers (mock CLIs)
- Versioned tokens (`$CRED(resource:v1)`) are defined in the token spec but not yet implemented at the provider level
