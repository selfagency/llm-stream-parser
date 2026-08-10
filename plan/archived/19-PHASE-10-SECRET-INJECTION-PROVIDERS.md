# Phase 10: Secret Injection & Provider Integrations

**Status**: Draft  
**Branch**: `feature/phase-10-secret-injection` (off `develop`)  
**PR**: #TBD  
**Depends on**: Phase 5 guardrails (`feature/phase-5-guardrails`), `@agentsy/secrets` broker

---

## 1. Problem Statement

### 1.1 The core problem

When an agent needs a secret (API key, password, token), it currently goes through this flow:

```text
User: "deploy using token sk-abc..."
    │
    ▼
LLM receives the secret in user prompt (if user typed it)
    │
    ▼
LLM puts the secret into tool args: shell({ cmd: "vercel --token sk-abc..." })
    │
    ▼
[Guardrail pipeline] detects the secret, resolves via CredentialBroker
    │  → if matched: transform to $CRED(vercel_prod), tool executes with real value
    │  → output redacted before returning to LLM
    ▼
LLM context still holds the raw secret (it generated the args)
```

**The gap**: The LLM saw the raw secret when it generated the tool call. That raw secret remains in the LLM's context window across the entire session. Context compression preserves LLM-visible text — if the LLM saw `sk-abc...`, compression shrinks it but doesn't remove it.

**Worse**: If the user pastes a secret into a prompt, the LLM reads it, generates tool args with it, and the raw value propagates through the LLM context. The guardrails only catch it at the tool boundary (post-generation).

### 1.2 The fix

Never let the LLM see the raw secret in the first place. Use a **secret injection token**:

```text
LLM sees:  shell({ cmd: "vercel --token $CRED(vercel_prod)" })
               ▲                                ▲
               │                                │
          User wrote $CRED(…)          Or the runtime injected it
          explicitly                     before the prompt
```

The runtime resolves `$CRED(...)` tokens to real values **only at the tool execution boundary**. The LLM's context never contains the raw secret.

---

## 2. OWASP Secrets Management Principles (Mapped)

| OWASP Principle | How Phase 10 Implements It |
|----------------|---------------------------|
| **Centralize & Standardize** (2.2) | Single `KeyringProvider` interface; all secret managers share one resolution pipeline |
| **Access Control** (2.3) | `CredentialBroker` enforces per-session scope; `PolicyEngine` gates access by tool annotations |
| **Automate Rotation** (2.4) | Dynamic TTL (default 300s); providers can set TTL per resource type |
| **Auditing** (2.6) | Every `issue`/`resolve`/`revoke` logged with `sessionId` + `toolCallId` + timestamp |
| **Secret Lifecycle** (2.7) | `create → issue → resolve → revoke/expire` tracked end-to-end |
| **TLS Everywhere** (2.8) | All cloud provider SDKs enforce HTTPS; local providers via CLI wrap OS transport |
| **CI/CD Hardening** (3.1) | `$CRED(...)` tokens in config files are inert without the runtime resolver — safe to commit |
| **Dynamic over Static** (3.5) | Broker uses short TTL (300s) by default; providers can request dynamic creds via Vault/cloud |

---

## 3. Architecture

### 3.1 Token Format

```text
$CRED(<resourceType>[:<field>])
```

| Form | Example | Meaning |
|------|---------|---------|
| Simple | `$CRED(vercel_prod)` | Resolve the default field for `vercel_prod` |
| Field-qualified | `$CRED(database:password)` | Resolve specific field `password` on `database` |
| Versioned | `$CRED(aws_credentials:v1)` | Pin to a specific version/iteration |

Tokens are case-sensitive, alphanumeric + underscore + hyphen.

### 3.2 Resolution Flow

```text
LLM generates: shell({ cmd: "deploy --token $CRED(vercel_prod)" })
    │
    ▼
[PreToolCall hook: CredentialAwareHook]  ← NEW
    │
    ├─ Parse all $CRED(...) tokens in args
    ├─ For each token:
    │    ├─ broker.check(resourceType)  → does the provider have this secret?
    │    ├─ broker.issue(request)       → short-lived encrypted credential
    │    └─ broker.resolve(credId)      → decrypt just-in-time at execution
    │
    ├─ Original args are REPLACED with resolved values in the tool call
    ├─ Original args (with $CRED tokens) are what the LLM sees in context
    └─ Raw values are NEVER returned to the LLM
    │
    ▼
[PostToolCall hook: createSecretDetectionHook]
    │
    └─ Tool output is scanned for leaked secrets → redacted before LLM return
```

### 3.3 Keyring Provider Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CredentialBroker                         │
│  issue(), resolve(), revoke(), listActive(), check(), getAuditLog│
└──────────────────────────┬──────────────────────────────────────┘
                           │ delegates to
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        KeyringProvider                          │  ← NEW
│  resolve(rawSecret), check(resourceType), list(), sync()        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ one of:
                           ▼
┌───────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 1Password │ Dashlane │ LastPass │ Bitwarden│ Vault    │ AWS SM   │
│ (op CLI)  │ (dcli)   │ (lpass)  │ (bw CLI) │ (vault)  │ (SDK)    │
└───────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
┌───────────┬──────────┬──────────┬──────────┬─────────────────────┐
│ GCP SM    │ Azure KV │ Doppler  │ Infisical│ Apple PM (macOS)     │
│ (gcloud)  │ (az CLI) │ (doppler)│ (infisical)│ (Security.framework)│
└───────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

### 3.4 Provider Capability Matrix

| Provider | Auth Method | Resolution | Listing | Sync | TTL Support |
|----------|-------------|------------|---------|------|-------------|
| **1Password** | `op signin` / `OP_SERVICE_ACCOUNT_TOKEN` | `op read op://vault/item/field` | `op item list` | `op sync` | N/A (CLI) |
| **Dashlane** | `dcli auth` | `dcli password <name>` | `dcli password --list` | `dcli sync` | N/A (CLI) |
| **LastPass** | `lpass login` | `lpass show <name> --password` | `lpass ls` | `lpass sync` | N/A (CLI) |
| **Bitwarden** | `bw login --apikey` / session | `bw get password <id>` | `bw list items` | `bw sync` | N/A (CLI) |
| **HashiCorp Vault** | VAULT_TOKEN / OIDC / K8s | HTTP API `secret/data/<path>` | `vault kv list` | N/A | Dynamic via `vault read` |
| **AWS Secrets Manager** | AWS SDK credential chain | `GetSecretValue` API | `ListSecrets` | N/A | Rotation config |
| **GCP Secret Manager** | ADC / service-account | `secretmanager.versions.access` | List API | N/A | Rotation config |
| **Azure Key Vault** | DefaultAzureCredential / CLI | `GetSecret` API | `GetSecrets` | N/A | Rotation config |
| **Doppler** | `DOPPLER_TOKEN` | `doppler secrets get <name>` | `doppler secrets list` | N/A | N/A |
| **Infisical** | `INFISICAL_TOKEN` | `infisical secrets get <name>` | `infisical secrets list` | `infisical sync` | N/A |
| **Apple PM** | macOS Keychain | `security find-generic-password` | `security dump-keychain` | N/A | N/A |

---

## 4. File Map

### 4.1 `@agentsy/secrets` — New files

| File | Purpose |
|------|---------|
| `src/provider/types.ts` | `KeyringProvider` interface, `ProviderConfig`, `ProviderCapabilities` |
| `src/provider/registry.ts` | `ProviderRegistry` — discover, register, resolve providers |
| `src/provider/local/1password.ts` | 1Password CLI `KeyringProvider` |
| `src/provider/local/dashlane.ts` | Dashlane CLI `KeyringProvider` |
| `src/provider/local/lastpass.ts` | LastPass CLI `KeyringProvider` |
| `src/provider/local/bitwarden.ts` | Bitwarden CLI `KeyringProvider` |
| `src/provider/local/apple-pm.ts` | Apple Password Manager (macOS `security` CLI) |
| `src/provider/cloud/vault.ts` | HashiCorp Vault `KeyringProvider` |
| `src/provider/cloud/aws-sm.ts` | AWS Secrets Manager `KeyringProvider` |
| `src/provider/cloud/gcp-sm.ts` | GCP Secret Manager `KeyringProvider` |
| `src/provider/cloud/azure-kv.ts` | Azure Key Vault `KeyringProvider` |
| `src/provider/cloud/doppler.ts` | Doppler `KeyringProvider` |
| `src/provider/cloud/infisical.ts` | Infisical `KeyringProvider` |
| `src/injection/types.ts` | `$CRED(...)` token types and parsers |
| `src/injection/resolver.ts` | `resolveCredentials(input, broker)` — scans and resolves all `$CRED(...)` |
| `src/injection/error.ts` | `UnresolvedCredentialError`, `ExpiredCredentialError` |
| `src/config/schema.ts` | Zod schema for `.agentsy/secrets.yaml` |
| `src/config/loader.ts` | Config file discovery and loading |
| `test/provider/registry.test.ts` | Provider registry tests |
| `test/provider/1password.test.ts` | 1Password keyring tests (mocked CLI) |
| `test/provider/dashlane.test.ts` | Dashlane keyring tests |
| `test/provider/lastpass.test.ts` | LastPass keyring tests |
| `test/provider/bitwarden.test.ts` | Bitwarden keyring tests |
| `test/provider/apple-pm.test.ts` | Apple PM keyring tests |
| `test/provider/vault.test.ts` | Vault keyring tests |
| `test/provider/aws-sm.test.ts` | AWS SM keyring tests |
| `test/provider/gcp-sm.test.ts` | GCP SM keyring tests |
| `test/provider/azure-kv.test.ts` | Azure KV keyring tests |
| `test/provider/doppler.test.ts` | Doppler keyring tests |
| `test/provider/infisical.test.ts` | Infisical keyring tests |
| `test/injection/resolver.test.ts` | Token resolution tests |
| `test/config.test.ts` | Config loading and schema tests |

### 4.2 `@agentsy/secrets` — Modified files

| File | Change |
|------|--------|
| `package.json` | Add optional deps: `@aws-sdk/client-secrets-manager`, `@google-cloud/secret-manager`, `@azure/identity`, `@azure/keyvault-secrets` |
| `src/index.ts` | Export provider types, registry, resolver, config |
| `tsup.config.ts` | Add provider subpath entries, external cloud SDKs |
| `tsconfig.json` | No changes needed |

### 4.3 `@agentsy/runtime` — New/modified files

| File | Change |
|------|--------|
| `src/hooks/credential-resolver.ts` | NEW: `createCredentialResolverHook` — pre-tool-call `$CRED(...)` resolution |
| `src/hooks/index.ts` | Export new hook |

### 4.4 `@agentsy/guardrails` — Modified files

| Phase 5 CredentialReferenceScanner already exists — no changes needed.

### 4.5 `@agentsy/cli` — New files

| File | Purpose |
|------|---------|
| `src/commands/secrets/init.ts` | `agentsy secrets init` — bootstrap config |
| `src/commands/secrets/list.ts` | `agentsy secrets list` — list available secrets |
| `src/commands/secrets/lookup.ts` | `agentsy secrets lookup <name>` — test resolution |
| `src/commands/secrets/sync.ts` | `agentsy secrets sync` — refresh provider cache |

### 4.6 Config file — `.agentsy/secrets.yaml`

```yaml
# .agentsy/secrets.yaml
version: 1

# Resource type → provider mapping
providers:
  # Local password managers (first-match wins)
  1password:
    vault: "Agentsy"
    item: "Vercel Production"
    field: "token"
    resourceTypes: ["vercel_prod"]

  aws:
    region: "us-east-1"
    resourceTypes: ["aws_deploy", "aws_rds"]

  vault:
    addr: "https://vault.example.com"
    namespace: "team-eng"
    resourceTypes: ["database", "ci_cd"]

# Fallback when no resource type matches a provider
defaultProvider: "1password"

# TTL overrides (default: 300s)
ttl:
  database: 60         # 1 minute for database creds
  aws_deploy: 900      # 15 minutes for deployment
```

---

## 5. Implementation Plan — 7 Batches

### Batch 1: Token Type System & Resolver (~4h)

**Core work**:

- Define `$CRED(...)` token regex and parser in `src/injection/types.ts`
- Implement `resolveCredentials(input, broker)` in `src/injection/resolver.ts`
- Implement `createCredentialResolverHook` in `@agentsy/runtime`
- Implement `ResourceTypeMapper` — maps detected secret patterns to resource types
- Write tests for token parsing, nested, field-qualified, edge cases

**Files**: 4 new, 2 modified  
**Dependencies**: None (pure infrastructure)

**Exit criteria**:

- `parseCredTokens(text)` correctly extracts all `$CRED(...)` tokens from string
- `resolveCredentials(text, broker)` replaces tokens with resolved values
- `credentialResolverHook` works as a pre-tool-call hook in the runtime
- Token formats reject malformed syntax with clear errors
- ✅ All tests pass, 0 lint errors, 0 type errors

---

### Batch 2: `KeyringProvider` Interface & Registry (~5h)

**Core work**:

- Define `KeyringProvider` interface in `src/provider/types.ts`:

```typescript
export interface KeyringProvider {
  /** Unique provider identifier (e.g., '1password', 'aws-sm'). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Provider capability flags. */
  readonly capabilities: ProviderCapabilities;

  /** Check if a resource type is available via this provider. */
  check(resourceType: string): Promise<boolean>;

  /** Resolve the raw secret value for a resource type. 
   *  Throws if unavailable or unreachable. */
  resolve(resourceType: string): Promise<string>;

  /** List all available resource types this provider can resolve. */
  list(): Promise<string[]>;

  /** Optional: synchronize/refresh local cache. */
  sync?(): Promise<void>;
}
```

- Implement `ProviderRegistry` in `src/provider/registry.ts`
- Implement config schema in `src/config/schema.ts`
- Implement `loadConfig()` in `src/config/loader.ts`
- Write tests

**Exit criteria**:

- `ProviderRegistry` supports register, discover, resolve-by-resource-type
- Config file schema validated with Zod
- Config discovery: `./.agentsy/secrets.yaml` → `./secrets.yaml` → `~/.config/agentsy/secrets.yaml`
- Provider lookup by resource type returns correct provider
- ✅ All tests pass, 0 lint errors, 0 type errors

---

### Batch 3: Local CLI-Based Provider Keyrings (~6h)

**Core work**: Implement each provider as a `KeyringProvider`:

**3a. 1Password Keyring** (~1.5h)

- Wrap `op read op://vault/item/field` for resolution
- Use `op item list --vault=<vault>` for listing
- Support `OP_SERVICE_ACCOUNT_TOKEN` env var (CI headless)
- Support `op://` URI format directly (e.g., `$CRED(op://Agentsy/Vercel/token)`)
- Fall back to `op run --env-file` pattern

**3b. Bitwarden Keyring** (~1h)

- Wrap `bw get password <id>` for resolution
- Wrap `bw list items` for listing
- Detect locked vault → guide user through `bw unlock`
- Support `BW_SESSION` env var

**3c. Dashlane Keyring** (~1h)

- Wrap `dcli password <name>` for resolution
- Wrap `dcli password --list` for listing
- Handle 2FA prompts gracefully

**3d. LastPass Keyring** (~1h)

- Wrap `lpass show <name> --password --sync=no`
- Wrap `lpass ls` for listing
- Handle offline cache

**3e. Apple Password Manager** (~1h)

- Wrap `security find-generic-password -w -a <account> -s <service>`
- Wrap `security dump-keychain` for listing (no passwords)
- macOS only, graceful skip on Linux

**Exit criteria**:

- All 5 providers implement the full `KeyringProvider` interface
- Each provider tested with mocked CLI execution
- Provider correctly handles CLI-not-installed, auth-failed, and not-found cases
- ✅ All tests pass, 0 lint errors, 0 type errors

**Key security design**: Each provider:

- Resolves secrets **just-in-time** via subprocess — secrets never touch disk in plaintext
- Errors on CLI missing → clear message "Install 1Password CLI: op --version"
- Integrates with `CredentialBroker` → short TTL, audit trail, encrypted in memory

---

### Batch 4: Cloud SDK-Based Provider Keyrings (~6h)

**4a. HashiCorp Vault Keyring** (~1.5h)

- Wrap `vault kv get -field=<field> <path>` for CLI mode
- Use HTTP API `/v1/<path>/data/<name>` for SDK mode
- Support `VAULT_TOKEN`, `VAULT_ADDR`, `VAULT_NAMESPACE`
- Support OIDC auth (auto-detect)
- Support dynamic secrets (lease-based)
- List via `vault kv list <mount>/metadata`

**4b. AWS Secrets Manager Keyring** (~1.5h)

- Use `@aws-sdk/client-secrets-manager` SDK
- `GetSecretValueCommand` for resolution
- `ListSecretsCommand` for listing
- Support AWS SDK credential chain (env, profile, IMDS, ECS)
- Support cross-region resolution via `region` config

**4c. GCP Secret Manager Keyring** (~1h)

- Use `@google-cloud/secret-manager` SDK
- `accessSecretVersion` for resolution
- List API for listing
- Support ADC (Application Default Credentials) + service account

**4d. Azure Key Vault Keyring** (~1h)

- Use `@azure/identity` + `@azure/keyvault-secrets` SDK
- `getSecret` for resolution
- List API for listing
- Support `DefaultAzureCredential` chain (env, Azure CLI, Managed Identity)

**4e. Doppler Keyring** (~0.5h)

- Wrap `doppler secrets get <name>` CLI
- Support `DOPPLER_TOKEN` for CI
- List via `doppler secrets list`

**4f. Infisical Keyring** (~0.5h)

- Wrap `infisical secrets get <name>` CLI
- Support `INFISICAL_TOKEN` for CI
- List via `infisical secrets list`

**Exit criteria**:

- All 6 providers implement `KeyringProvider`
- Cloud SDK providers are optional dependencies (tree-shakeable)
- CLI wrappers have mocked tests; SDK providers have minimal connectivity tests
- ✅ All tests pass, 0 lint errors, 0 type errors

---

### Batch 5: CLI Commands (~3h)

**Core work**:

- `agentsy secrets init` — interactive wizard to bootstrap `.agentsy/secrets.yaml`
- `agentsy secrets list` — show all available secrets across all providers
- `agentsy secrets lookup <name>` — resolve + display masked value
- `agentsy secrets sync` — trigger `sync()` on all providers

Each CLI command returns stable JSON for agent consumption (`--json` flag).

**Exit criteria**:

- CLI is the primary user-facing interface for secret management
- `init` produces a valid YAML config file
- `list` shows provider, resource type, status, expiry
- `lookup` shows masked value (e.g., `sk-...xyz`) unless `--reveal` is passed
- ✅ All tests pass, 0 lint errors, 0 type errors

---

### Batch 6: E2E & Integration Tests (~3h)

**Core work**:

- E2E test: full secret injection flow (token → broker → tool execution → output redaction)
- E2E test: provider chain (1Password → Vault → Doppler fallback)
- E2E test: `$CRED(...)` in compressed context survives round-trip without leaking
- Integration test: mock CLI for each local provider
- Integration test: credential expiry + refresh cycle
- Security test: malformed tokens don't crash resolver
- Security test: `$CRED(...)` tokens in tool output are properly redacted

**Exit criteria**:

- All E2E tests pass
- Context compression test proves `$CRED(...)` tokens survive compression
- ✅ All tests pass, 0 lint errors, 0 type errors

---

### Batch 7: ADR & Documentation (~2h)

**Core work**:

- ADR documenting the `$CRED(...)` injection architecture
- Provider integration guide (how to add a new provider)
- User guide: `agentsy secrets init` walkthrough
- User guide: using `$CRED(...)` tokens in prompts and config
- CLI `--help` text updates
- README updates for `@agentsy/secrets`

---

## 6. Estimated Timeline

| Batch | Work | Est. | Dependencies |
|-------|------|------|-------------|
| B1 | Token type system & resolver | 4h | None |
| B2 | KeyringProvider interface & registry | 5h | B1 |
| B3 | Local CLI providers (5x) | 6h | B2 |
| B4 | Cloud SDK providers (6x) | 6h | B2 |
| B5 | CLI commands | 3h | B2, B3, B4 |
| B6 | E2E & integration tests | 3h | B1–B5 |
| B7 | ADR & docs | 2h | B1–B5 |
| **Total** | | **~29h** | |

---

## 7. Security Design Review

### 7.1 Threat model

| Threat | Mitigation |
|--------|-----------|
| LLM leaks `$CRED(...)` token to external tool | Token is inert outside the agentsy runtime — no resolver = no secret |
| Attacker reads context dump | `$CRED(...)` tokens look like environment variables; no raw secrets in context |
| CLI output captured in logs | `resolve()` returns a `CredentialBroker`-issued short-TTL reference, not raw value. Raw value only lives in the subprocess's memory |
| Provider SDK leaks via error message | `KeyringProvider.resolve()` catches and wraps errors, never includes raw value |
| Token collision (two providers claim same resourceType) | `ProviderRegistry` returns first-match-wins; config file controls ordering |

### 7.2 Privacy-by-design

- Providers never cache raw values to disk
- `CredentialBroker` encrypts values in memory (AES-GCM in production, base64 placeholder today)
- Audit log records `sessionId` and `toolCallId` — enables forensics without storing credential values
- Listing secrets shows resource type + provider, never raw values
- CLI `lookup` defaults to masked output (`sk-...xyz`); `--reveal` requires confirmation

### 7.3 OWASP alignment

| OWASP Requirement | Coverage |
|------------------|----------|
| Centralized storage | ProviderRegistry is the single resolution entry point |
| Least privilege | Per-session scoping via CredentialBroker |
| Rotation / TTL | Default 300s; configurable per resource type |
| Auditing | Every issue/resolve/revoke logged |
| TLS | All cloud SDK providers enforce HTTPS |
| CI/CD safe | `$CRED(...)` tokens in config files are inert without runtime |
| Dynamic secrets | Vault provider supports lease-based dynamic credentials |
| Memory handling | Secrets never stored in LLM context; broker holds encrypted |

---

## 8. Key Design Decisions

### 8.1 Why CLI wrappers for local providers (not SDKs)?

1Password, Dashlane, LastPass, and Bitwarden all have CLIs that handle auth, session management, and 2FA. Wrapping the CLI means we inherit all their auth logic for free. An SDK integration would need to reimplement auth flows (biometric unlock, device trust, etc.). The tradeoff is subprocess overhead (~50ms per resolution) — acceptable for agent tool-call boundaries.

### 8.2 Why `$CRED(...)` tokens instead of environment variables?

Environment variables are process-wide and visible to all subprocesses. `$CRED(...)` tokens are scoped to a specific tool call, have a TTL, and are resolved just-in-time through the audit trail.

### 8.3 Why not a generic `op run --env-file` approach?

`op run` wraps an entire process. For an agent system that makes many tool calls across a session, this would require either:

- One long-lived wrapped process (loses per-call auditing)
- Per-call wrapping (repeated auth overhead)

The `$CRED(...)` token approach gives per-call granularity with a single auth session.

### 8.4 Cloud SDKs: optional peer dependencies

Cloud SDK providers (`@aws-sdk/client-secrets-manager`, `@google-cloud/secret-manager`, etc.) are **optional peer dependencies**. They're only installed if the user configures that provider. The package tree-shakes unused providers. This keeps the install size small for users who only need local password managers.
